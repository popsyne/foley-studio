"""Foley Studio — FastAPI backend v4.

Changes from v3:
  - AudioSR integration: optional 48kHz super-resolution post-processing
  - AudioSR model lazy-loaded on first use, cached in memory
  - VRAM management: unloads Stable Audio before loading AudioSR if needed

Previous (v3):
  - FIX: negative prompt no longer sent when enhance is off
  - Auto-save all outputs with smart naming + WAV metadata
  - Editable enhanced_prompt/negative_prompt overrides
  - Lighter prompt enhancement
"""

from __future__ import annotations

import itertools
import json
import logging
import math
import os
import random
import re
import struct
import time
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# ═══════════════════════════════════════════════════════════════════════════════
# Config — reads from config.txt (next to this file's parent dir)
# ═══════════════════════════════════════════════════════════════════════════════

def _read_config():
    """Read key=value pairs from config.txt. Returns dict.

    On first run, if config.txt doesn't exist but config.example.txt does,
    copy the example so the user has something to edit.
    """
    cfg = {}
    root = Path(__file__).parent.parent
    config_path = root / "config.txt"
    example_path = root / "config.example.txt"

    # First-run convenience: seed config.txt from the example
    if not config_path.exists() and example_path.exists():
        try:
            config_path.write_text(example_path.read_text(encoding="utf-8"),
                                    encoding="utf-8")
            log.info("Created config.txt from config.example.txt — edit it to set MODEL_PATH")
        except Exception:
            pass

    if not config_path.exists():
        # Also check same dir as server.py (in case of flat layout)
        config_path = Path(__file__).parent / "config.txt"
    if not config_path.exists():
        return cfg
    for line in config_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, val = line.split("=", 1)
            val = val.strip()
            if val:
                cfg[key.strip()] = val
    return cfg

_user_cfg = _read_config()

CKPT_PATH = os.environ.get("CKPT_PATH",
    _user_cfg.get("MODEL_PATH", ""))
if not CKPT_PATH:
    log.warning("No model path set! Edit config.txt and set MODEL_PATH.")

# Auto-save outputs here (in addition to serving via API)
AUTOSAVE_DIR = os.environ.get("FOLEY_OUTPUT_DIR",
    _user_cfg.get("OUTPUT_DIR", r".\foley_output"))

# AudioSR super-resolution (optional enhancement)
AUDIOSR_ENABLED = os.environ.get("AUDIOSR_ENABLED", "true").lower() in ("1", "true", "yes")
AUDIOSR_MODEL_NAME = os.environ.get("AUDIOSR_MODEL", "basic")  # "basic" or "speech"

OUTPUT_DIR = Path(__file__).parent / "outputs"  # internal serving dir
OUTPUT_DIR.mkdir(exist_ok=True)
Path(AUTOSAVE_DIR).mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("foley")

# ═══════════════════════════════════════════════════════════════════════════════
# Stable Audio Open config (embedded)
# ═══════════════════════════════════════════════════════════════════════════════

STABLE_AUDIO_CONFIG = {
    "model_type": "diffusion_cond",
    "sample_size": 441000,
    "sample_rate": 44100,
    "audio_channels": 2,
    "model": {
        "pretransform": {
            "type": "autoencoder", "iterate_batch": True,
            "config": {
                "encoder": {"type": "oobleck", "requires_grad": False,
                    "config": {"in_channels": 2, "channels": 128,
                        "c_mults": [1,2,4,8,16], "strides": [2,4,4,8,8],
                        "latent_dim": 128, "use_snake": True}},
                "decoder": {"type": "oobleck",
                    "config": {"out_channels": 2, "channels": 128,
                        "c_mults": [1,2,4,8,16], "strides": [2,4,4,8,8],
                        "latent_dim": 64, "use_snake": True, "final_tanh": False}},
                "bottleneck": {"type": "vae"},
                "latent_dim": 64, "downsampling_ratio": 2048, "io_channels": 2
            }
        },
        "conditioning": {
            "configs": [
                {"id": "prompt", "type": "t5",
                 "config": {"t5_model_name": "t5-base", "max_length": 128}},
                {"id": "seconds_start", "type": "number", "config": {"min_val": 0, "max_val": 512}},
                {"id": "seconds_total", "type": "number", "config": {"min_val": 0, "max_val": 512}},
            ],
            "cond_dim": 768
        },
        "diffusion": {
            "cross_attention_cond_ids": ["prompt", "seconds_start", "seconds_total"],
            "global_cond_ids": ["seconds_start", "seconds_total"],
            "type": "dit",
            "config": {"io_channels": 64, "embed_dim": 1536, "depth": 24,
                "num_heads": 24, "cond_token_dim": 768, "global_cond_dim": 1536,
                "project_cond_tokens": False, "transformer_type": "continuous_transformer"}
        },
        "io_channels": 64
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Model Loading
# ═══════════════════════════════════════════════════════════════════════════════

ACTIVE_MODEL = "mock"
SAMPLE_RATE = 44100
SAMPLE_SIZE = 441000
GPU_AVAILABLE = False
_model = None
_device = "cpu"

def _try_load_model():
    global GPU_AVAILABLE, _device
    ckpt = Path(CKPT_PATH)
    if not ckpt.exists():
        log.warning(f"Checkpoint not found: {CKPT_PATH}")
        return None
    log.info(f"Found checkpoint: {ckpt} ({ckpt.stat().st_size / 1e9:.1f} GB)")
    try:
        import torch
        GPU_AVAILABLE = torch.cuda.is_available()
        _device = "cuda" if GPU_AVAILABLE else "cpu"
    except ImportError:
        log.error("PyTorch not installed")
        return None
    try:
        from stable_audio_tools.models.factory import create_model_from_config
        from stable_audio_tools.models.utils import load_ckpt_state_dict
        log.info("Loading Stable Audio Open 1.0...")
        model = create_model_from_config(STABLE_AUDIO_CONFIG)
        model.load_state_dict(load_ckpt_state_dict(str(ckpt)), strict=False)
        model = model.to(_device).eval()
        log.info(f"✓ Loaded on {_device}")
        return model
    except Exception as e:
        log.exception(f"Failed: {e}")
        return None

_model = _try_load_model()
if _model:
    ACTIVE_MODEL = "stable-audio-open-1.0"
    SAMPLE_RATE = 44100
    SAMPLE_SIZE = 441000
MOCK_MODE = (_model is None)
log.info(f"Model: {ACTIVE_MODEL} | Mock: {MOCK_MODE}")

# ═══════════════════════════════════════════════════════════════════════════════
# AudioSR Super-Resolution (lazy loaded)
# ═══════════════════════════════════════════════════════════════════════════════

_audiosr_model = None
_audiosr_available = False  # True once we confirm the package is importable

def _check_audiosr():
    """Check if audiosr package is installed (doesn't load the model yet)."""
    global _audiosr_available
    if not AUDIOSR_ENABLED:
        log.info("AudioSR: disabled via config")
        return
    try:
        import audiosr  # noqa: F401
        _audiosr_available = True
        log.info("AudioSR: package found (model will load on first use)")
    except ImportError:
        _audiosr_available = False
        log.info("AudioSR: not installed (pip install audiosr==0.0.7)")

_check_audiosr()

def _load_audiosr():
    """Lazy-load AudioSR model into GPU memory."""
    global _audiosr_model
    if _audiosr_model is not None:
        return _audiosr_model
    if not _audiosr_available:
        return None
    try:
        import audiosr
        log.info(f"AudioSR: loading '{AUDIOSR_MODEL_NAME}' model (first use)...")
        _audiosr_model = audiosr.build_model(model_name=AUDIOSR_MODEL_NAME, device=_device)
        log.info("AudioSR: model loaded successfully")
        return _audiosr_model
    except Exception as e:
        log.error(f"AudioSR: failed to load: {e}")
        return None

def _unload_audiosr():
    """Free AudioSR from GPU memory."""
    global _audiosr_model
    if _audiosr_model is not None:
        import torch
        del _audiosr_model
        _audiosr_model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        log.info("AudioSR: unloaded from memory")

def audiosr_enhance(audio: np.ndarray, sr: int, ddim_steps: int = 50,
                    guidance_scale: float = 3.5, seed: int = 42) -> tuple[np.ndarray, int]:
    """Run AudioSR on a mono float32 numpy array. Returns (enhanced_audio, 48000).

    Writes a temp WAV, runs AudioSR, reads back the result.
    AudioSR always outputs 48kHz.
    """
    import tempfile, soundfile as sf

    model = _load_audiosr()
    if model is None:
        log.warning("AudioSR: model not available, returning original audio")
        return audio, sr

    try:
        import audiosr

        # AudioSR expects a file path, so write a temp WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_in = tmp.name
        sf.write(tmp_in, audio, sr, subtype='FLOAT')

        # Run super-resolution
        waveform = audiosr.super_resolution(
            model,
            tmp_in,
            seed=seed,
            guidance_scale=guidance_scale,
            ddim_steps=ddim_steps,
            latent_t_per_second=12.8,
        )

        # waveform is a torch tensor [batch, channels, samples]
        import torch
        if isinstance(waveform, torch.Tensor):
            result = waveform.squeeze(0).mean(dim=0).cpu().numpy().astype(np.float32)
        else:
            result = np.array(waveform).flatten().astype(np.float32)

        # Clean up temp file
        try:
            os.unlink(tmp_in)
        except OSError:
            pass

        return result, 48000

    except Exception as e:
        log.error(f"AudioSR: enhancement failed: {e}")
        try:
            os.unlink(tmp_in)
        except (OSError, NameError):
            pass
        return audio, sr

# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════════════════

class JobStatus(str, Enum):
    QUEUED = "queued"; RUNNING = "running"; DONE = "done"; ERROR = "error"

class GenRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    seconds: float = Field(default=2.0, ge=0.1, le=47.0)
    seed: Optional[int] = None
    cfg_scale: float = Field(default=7.0, ge=1.0, le=15.0)
    steps: int = Field(default=100, ge=10, le=250)
    sampler: str = "dpmpp-3m-sde"
    enhance: bool = True
    # Override fields — frontend can edit the enhanced prompt directly
    enhanced_prompt_override: Optional[str] = None
    negative_prompt_override: Optional[str] = None
    # AudioSR super-resolution
    audiosr: bool = False
    audiosr_steps: int = Field(default=50, ge=10, le=100)
    audiosr_guidance: float = Field(default=3.5, ge=1.0, le=10.0)

class BatchRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    seconds: float = Field(default=2.0, ge=0.1, le=47.0)
    count: int = Field(default=8, ge=1, le=16)
    cfg_scale: float = Field(default=7.0, ge=1.0, le=15.0)
    steps: int = Field(default=100, ge=10, le=250)
    sampler: str = "dpmpp-3m-sde"
    enhance: bool = True
    enhanced_prompt_override: Optional[str] = None
    negative_prompt_override: Optional[str] = None
    audiosr: bool = False
    audiosr_steps: int = Field(default=50, ge=10, le=100)
    audiosr_guidance: float = Field(default=3.5, ge=1.0, le=10.0)

class RangeSpec(BaseModel):
    min: float; max: float; step: float

class MatrixRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    seconds: float = Field(default=2.0, ge=0.1, le=47.0)
    seed: int
    enhance: bool = True
    enhanced_prompt_override: Optional[str] = None
    negative_prompt_override: Optional[str] = None
    steps_range: Optional[RangeSpec] = None
    cfg_range: Optional[RangeSpec] = None
    samplers: Optional[List[str]] = None
    audiosr: bool = False
    audiosr_steps: int = Field(default=50, ge=10, le=100)
    audiosr_guidance: float = Field(default=3.5, ge=1.0, le=10.0)

class ClipMeta(BaseModel):
    seed: int = 0
    raw_prompt: str = ""
    enhanced_prompt: str = ""
    negative_prompt: str = ""
    model_id: str = ""
    duration_in: float = 0
    duration_out: float = 0
    peak_dbfs: float = 0
    rms_db: float = 0
    onset_time_estimate: float = 0
    sample_rate: int = SAMPLE_RATE
    cfg_scale: float = 7
    steps: int = 100
    sampler: str = ""
    saved_path: str = ""
    audiosr_applied: bool = False

class JobData(BaseModel):
    job_id: str = ""
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    error: Optional[str] = None
    wav_id: Optional[str] = None
    meta: Optional[ClipMeta] = None
    is_mock: bool = True
    created_at: float = 0
    started_at: Optional[float] = None
    finished_at: Optional[float] = None

class MatrixCombo(BaseModel):
    job_id: str; steps: int; cfg_scale: float; sampler: str

class MatrixResponse(BaseModel):
    matrix_id: str; job_ids: List[str]; combos: List[MatrixCombo]
    seed: int; prompt: str

# ═══════════════════════════════════════════════════════════════════════════════
# Prompt Enhancement (context-aware)
# ═══════════════════════════════════════════════════════════════════════════════

# Detect what kind of sound the user is generating
_INSTRUMENT_WORDS = {
    "piano", "guitar", "bass", "violin", "cello", "trumpet", "saxophone", "sax",
    "flute", "synth", "synthesizer", "organ", "marimba", "harp", "drum", "kick",
    "snare", "hi-hat", "cymbal", "chord", "note", "pluck", "bowed", "strum",
    "rhodes", "moog", "pad", "lead", "arpeggio",
}
_AMBIENT_WORDS = {
    "rain", "wind", "forest", "ocean", "river", "birds", "thunder", "storm",
    "night", "crickets", "ambience", "ambient", "atmosphere", "room tone",
}

def _detect_prompt_context(prompt: str) -> str:
    """Returns 'instrument', 'ambient', or 'foley'."""
    lower = prompt.lower()
    words = set(re.split(r'[\s,]+', lower))
    if words & _INSTRUMENT_WORDS:
        return "instrument"
    if words & _AMBIENT_WORDS:
        return "ambient"
    return "foley"

# Context-sensitive negative prompts
_NEG_FOLEY = "music, melody, singing, vocals, speech, drum beat, rhythm, loop, low quality, distorted"
_NEG_INSTRUMENT = "noise, hiss, hum, distorted, low quality, clipping, crowd, speech, room noise"
_NEG_AMBIENT = "music, melody, vocals, speech, clicking, clipping, low quality, distorted"

def _get_default_neg(prompt: str) -> str:
    ctx = _detect_prompt_context(prompt)
    if ctx == "instrument":
        return _NEG_INSTRUMENT
    elif ctx == "ambient":
        return _NEG_AMBIENT
    return _NEG_FOLEY

def enhance_prompt(user_prompt: str) -> str:
    """Lightly enhance — just add quality hint, don't rewrite."""
    return f"{user_prompt.strip()}, high quality recording, clean"

def resolve_prompt(raw: str, do_enhance: bool,
                   enhanced_override: Optional[str] = None,
                   neg_override: Optional[str] = None) -> tuple[str, str]:
    """Returns (final_prompt, negative_prompt).

    When enhance=False AND no overrides: raw prompt, empty negative.
    When enhance=True: enhanced prompt, context-aware negative.
    Overrides always win.
    """
    if enhanced_override is not None:
        final = enhanced_override.strip()
    elif do_enhance:
        final = enhance_prompt(raw)
    else:
        final = raw.strip()

    if neg_override is not None:
        neg = neg_override.strip()
    elif do_enhance:
        neg = _get_default_neg(raw)
    else:
        neg = ""  # no negative when enhance is off

    return final, neg

# ═══════════════════════════════════════════════════════════════════════════════
# Audio Utilities
# ═══════════════════════════════════════════════════════════════════════════════

def _make_info_chunk(tags: dict[str, str]) -> bytes:
    """Build a RIFF LIST/INFO chunk with metadata tags."""
    TAG_IDS = {
        "title": b"INAM", "artist": b"IART", "comment": b"ICMT",
        "software": b"ISFT", "genre": b"IGNR", "date": b"ICRD",
    }
    entries = b""
    for key, val in tags.items():
        tag_id = TAG_IDS.get(key)
        if not tag_id or not val:
            continue
        encoded = val.encode("ascii", errors="replace") + b"\x00"
        if len(encoded) % 2:
            encoded += b"\x00"  # word-align
        entries += tag_id + struct.pack("<I", len(encoded)) + encoded
    if not entries:
        return b""
    info_data = b"INFO" + entries
    return b"LIST" + struct.pack("<I", len(info_data)) + info_data

def save_wav_with_meta(path: str, audio: np.ndarray, sr: int, tags: dict[str, str]):
    """Save 16-bit WAV with RIFF INFO metadata."""
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767).astype(np.int16)
    pcm_bytes = pcm.tobytes()

    fmt_chunk = struct.pack("<4sIHHIIHH",
        b"fmt ", 16, 1, 1, sr, sr * 2, 2, 16)
    data_chunk = b"data" + struct.pack("<I", len(pcm_bytes)) + pcm_bytes
    info_chunk = _make_info_chunk(tags)

    riff_size = 4 + len(fmt_chunk) + len(data_chunk) + len(info_chunk)
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", riff_size) + b"WAVE")
        f.write(fmt_chunk)
        f.write(data_chunk)
        if info_chunk:
            f.write(info_chunk)

def trim_silence(audio, sr, threshold_db=-40.0):
    threshold = 10.0 ** (threshold_db / 20.0)
    above = np.where(np.abs(audio) > threshold)[0]
    if len(above) == 0:
        return audio[:max(64, int(0.01 * sr))]
    pad = int(sr * 0.002)
    return audio[max(0, above[0]-pad) : min(len(audio), above[-1]+pad+1)]

def pad_to_duration(audio, sr, target_seconds):
    """Pad audio with silence to reach target duration, if it's shorter."""
    target_len = int(target_seconds * sr)
    if len(audio) >= target_len:
        return audio[:target_len]
    # Pad with silence (zeros)
    padded = np.zeros(target_len, dtype=np.float32)
    padded[:len(audio)] = audio
    return padded

def apply_fade(audio, sr, ms=5.0):
    n = max(1, min(int(sr * ms / 1000), len(audio) // 2))
    out = audio.copy()
    out[:n] *= np.linspace(0, 1, n, dtype=np.float32)
    out[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
    return out

def normalize_audio(audio, target_dbfs=-1.0):
    peak = np.max(np.abs(audio))
    if peak < 1e-8: return audio
    return audio * (10.0 ** (target_dbfs / 20.0) / peak)

def audio_stats(audio, sr):
    peak = float(np.max(np.abs(audio)))
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak_db = 20 * math.log10(peak) if peak > 0 else -120
    rms_db = 20 * math.log10(rms) if rms > 0 else -120
    thr = 10.0 ** (-20.0 / 20.0)
    above = np.where(np.abs(audio) > thr)[0]
    onset = float(above[0] / sr) if len(above) > 0 else 0.0
    return dict(duration_out=round(len(audio)/sr, 4),
                peak_dbfs=round(peak_db, 2), rms_db=round(rms_db, 2),
                onset_time_estimate=round(onset, 4))

# ═══════════════════════════════════════════════════════════════════════════════
# Smart Filename
# ═══════════════════════════════════════════════════════════════════════════════

def _sanitize(s: str, maxlen: int = 30) -> str:
    s = re.sub(r'[^\w\s-]', '', s.lower().strip())
    s = re.sub(r'[\s]+', '_', s)
    return s[:maxlen]

def _sampler_abbrev(s: str) -> str:
    abbrevs = {"dpmpp-3m-sde":"dpm3m", "dpmpp-2m-sde":"dpm2m",
               "k-dpm-2":"kdpm2", "k-heun":"kheun", "k-lms":"klms"}
    return abbrevs.get(s, s[:6])

def make_autosave_name(raw_prompt: str, seed: int, steps: int,
                       cfg: float, sampler: str) -> str:
    """Generate descriptive filename. Deduplicates with suffix."""
    first_word = _sanitize(raw_prompt.split(",")[0].strip(), 24)
    if not first_word: first_word = "clip"
    base = f"{first_word}_s{seed}_{steps}st_cfg{cfg}_{_sampler_abbrev(sampler)}"
    return base

def deduplicate_path(directory: str, basename: str, ext: str = ".wav") -> Path:
    p = Path(directory) / f"{basename}{ext}"
    if not p.exists(): return p
    i = 2
    while True:
        p = Path(directory) / f"{basename}_{i}{ext}"
        if not p.exists(): return p
        i += 1

# ═══════════════════════════════════════════════════════════════════════════════
# Generation
# ═══════════════════════════════════════════════════════════════════════════════

def generate_audio(prompt, neg, seconds, seed, cfg, steps, sampler, progress_cb=None):
    if MOCK_MODE:
        return _generate_mock(prompt, seconds, seed, progress_cb)
    return _generate_real(prompt, neg, seconds, seed, cfg, steps, sampler, progress_cb)

def _generate_real(prompt, neg, seconds, seed, cfg, steps, sampler, progress_cb):
    import torch
    from einops import rearrange as eo_rearrange
    from stable_audio_tools.inference.generation import generate_diffusion_cond
    if progress_cb: progress_cb(0.05)

    # Validate sampler — fall back to default if an unsupported name is passed
    VALID_SAMPLERS = {
        "dpmpp-3m-sde", "dpmpp-2m-sde", "k-heun", "k-lms",
        "k-dpmpp-2s-ancestral", "k-dpm-2", "k-dpm-fast",
    }
    if sampler not in VALID_SAMPLERS:
        log.warning(f"Unknown sampler '{sampler}', falling back to dpmpp-3m-sde")
        sampler = "dpmpp-3m-sde"

    # IMPORTANT: seconds_total should reflect the full generation window, NOT
    # the desired clip length. The model was trained with seconds_total being
    # the length of the *source file* (often 30-190s). Using the actual clip
    # duration (e.g. 2s) puts us way outside the training distribution and
    # produces bad results. We use the full sample_size duration (~10s for
    # Stable Audio Open 1.0) to stay in-distribution.
    total_seconds = SAMPLE_SIZE / SAMPLE_RATE  # 441000/44100 = 10.0

    cond = [{"prompt": prompt, "seconds_start": 0, "seconds_total": total_seconds}]
    neg_cond = [{"prompt": neg, "seconds_start": 0, "seconds_total": total_seconds}] if neg else None

    if progress_cb: progress_cb(0.1)
    with torch.no_grad():
        output = generate_diffusion_cond(
            _model, steps=steps, cfg_scale=cfg,
            conditioning=cond,
            negative_conditioning=neg_cond,
            sample_size=SAMPLE_SIZE,
            sigma_min=0.3, sigma_max=500,
            sampler_type=sampler, device=_device, seed=seed,
        )
    if progress_cb: progress_cb(0.9)

    # Match official post-processing: rearrange then normalize
    # output shape: [batch, channels, samples] -> [channels, samples]
    output = eo_rearrange(output, "b d n -> d (b n)")

    # Peak normalize (same as official HF example)
    output = output.to(torch.float32).div(torch.max(torch.abs(output))).clamp(-1, 1)

    # Convert to mono by averaging stereo channels (for WAV output)
    audio = output.mean(dim=0).cpu().numpy()

    # Trim to requested duration
    target_len = int(seconds * SAMPLE_RATE)
    audio = audio[:target_len].astype(np.float32)

    if progress_cb: progress_cb(1.0)
    return audio, SAMPLE_RATE

def _generate_mock(prompt, seconds, seed, progress_cb):
    sr = SAMPLE_RATE; n = int(seconds * sr)
    rng = np.random.RandomState(seed)
    t = np.linspace(0, seconds, n, dtype=np.float32)
    lower = prompt.lower()
    if progress_cb: progress_cb(0.1)
    if any(k in lower for k in ["hit","impact","punch","slam","crash","bang","explosion","boom"]):
        audio = rng.randn(n).astype(np.float32) * np.exp(-t*15) * 0.8
    elif any(k in lower for k in ["whoosh","swish","swoosh","sweep"]):
        audio = rng.randn(n).astype(np.float32) * np.sin(np.pi*t/seconds) * 0.5
    elif any(k in lower for k in ["click","tap","tick","snap","pop"]):
        audio = np.zeros(n, dtype=np.float32)
        cl = min(int(0.01*sr), n)
        audio[:cl] = rng.randn(cl).astype(np.float32) * 0.9 * np.exp(-np.linspace(0,10,cl))
    elif any(k in lower for k in ["tone","beep","sine","ring","bell","note","chord"]):
        freq = 440 + rng.randint(-200, 200)
        audio = (np.sin(2*np.pi*freq*t) * 0.6 * np.exp(-t*2)).astype(np.float32)
    else:
        freq = 200 + rng.randint(0, 800)
        audio = ((rng.randn(n)*0.3 + np.sin(2*np.pi*freq*t)*0.4) * np.exp(-t*(3+rng.random()*10))).astype(np.float32)
    if progress_cb: progress_cb(0.5)
    time.sleep(min(seconds * 0.3, 1.0))
    if progress_cb: progress_cb(1.0)
    return audio, sr

# ═══════════════════════════════════════════════════════════════════════════════
# Job Runner
# ═══════════════════════════════════════════════════════════════════════════════

jobs: Dict[str, JobData] = {}
pool = ThreadPoolExecutor(max_workers=1)

def _run_job(job_id: str, raw_prompt: str, final_prompt: str, neg: str,
             seconds: float, seed: int, cfg: float, steps: int, sampler: str,
             do_audiosr: bool = False, audiosr_steps: int = 50,
             audiosr_guidance: float = 3.5):
    job = jobs[job_id]
    job.status = JobStatus.RUNNING
    job.started_at = time.time()
    audiosr_applied = False
    try:
        job.progress = 0.1
        def cb(p): job.progress = 0.1 + p * 0.6  # 0.1-0.7 for generation

        raw_audio, sr = generate_audio(final_prompt, neg, seconds, seed,
                                       cfg, steps, sampler, cb)
        job.progress = 0.75

        audio = trim_silence(raw_audio, sr)
        audio = apply_fade(audio, sr)
        audio = pad_to_duration(audio, sr, seconds)
        audio = normalize_audio(audio)
        job.progress = 0.80

        # AudioSR super-resolution (optional)
        if do_audiosr and _audiosr_available:
            job.progress = 0.82
            log.info(f"[{job_id}] Running AudioSR ({audiosr_steps} steps, guidance {audiosr_guidance})...")
            audio, sr = audiosr_enhance(audio, sr, ddim_steps=audiosr_steps,
                                        guidance_scale=audiosr_guidance, seed=seed)
            audio = normalize_audio(audio)
            audio = pad_to_duration(audio, sr, seconds)  # enforce exact requested length
            audiosr_applied = True
            log.info(f"[{job_id}] AudioSR done → {sr}Hz, {len(audio)/sr:.2f}s")

        stats = audio_stats(audio, sr)
        job.progress = 0.92

        # Metadata tags for WAV
        sr_tag = " [AudioSR 48k]" if audiosr_applied else ""
        tags = {
            "title": raw_prompt[:80],
            "comment": f"seed={seed} steps={steps} cfg={cfg} sampler={sampler}{sr_tag} | enhanced: {final_prompt[:120]}",
            "software": f"Foley Studio / {ACTIVE_MODEL}",
            "date": time.strftime("%Y-%m-%d %H:%M"),
        }

        # Save to internal serving dir
        wav_id = f"{job_id}_{seed}"
        internal_path = OUTPUT_DIR / f"{wav_id}.wav"
        save_wav_with_meta(str(internal_path), audio, sr, tags)

        # Auto-save to user output folder
        base = make_autosave_name(raw_prompt, seed, steps, cfg, sampler)
        if audiosr_applied:
            base += "_48k"
        autosave_path = deduplicate_path(AUTOSAVE_DIR, base)
        save_wav_with_meta(str(autosave_path), audio, sr, tags)

        meta = ClipMeta(
            seed=seed, raw_prompt=raw_prompt,
            enhanced_prompt=final_prompt, negative_prompt=neg,
            model_id=ACTIVE_MODEL,
            duration_in=round(len(raw_audio)/SAMPLE_RATE, 4), sample_rate=sr,
            cfg_scale=cfg, steps=steps, sampler=sampler,
            saved_path=str(autosave_path), audiosr_applied=audiosr_applied,
            **stats,
        )
        (OUTPUT_DIR / f"{wav_id}.json").write_text(json.dumps(meta.model_dump(), indent=2))

        job.wav_id = wav_id
        job.meta = meta
        job.is_mock = MOCK_MODE
        job.status = JobStatus.DONE
        job.progress = 1.0
        job.finished_at = time.time()
        log.info(f"[{job_id}] Done → {autosave_path.name}")

    except Exception as e:
        log.exception(f"[{job_id}] Failed")
        job.status = JobStatus.ERROR
        job.error = str(e)
        job.finished_at = time.time()


def submit_job(raw_prompt: str, seconds: float, seed: Optional[int],
               cfg: float, steps: int, sampler: str,
               do_enhance: bool,
               enhanced_override: Optional[str] = None,
               neg_override: Optional[str] = None,
               do_audiosr: bool = False,
               audiosr_steps: int = 50,
               audiosr_guidance: float = 3.5) -> str:
    jid = uuid.uuid4().hex[:12]
    actual_seed = seed if seed is not None else random.randint(0, 2**31 - 1)
    final, neg = resolve_prompt(raw_prompt, do_enhance, enhanced_override, neg_override)
    job = JobData(job_id=jid, is_mock=MOCK_MODE, created_at=time.time())
    jobs[jid] = job
    pool.submit(_run_job, jid, raw_prompt, final, neg,
                seconds, actual_seed, cfg, steps, sampler,
                do_audiosr, audiosr_steps, audiosr_guidance)
    return jid

# ═══════════════════════════════════════════════════════════════════════════════
# FastAPI
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(title="Foley Studio")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"status": "ok", "mock_mode": MOCK_MODE, "model_id": ACTIVE_MODEL,
            "gpu_available": GPU_AVAILABLE, "sample_rate": SAMPLE_RATE,
            "autosave_dir": str(Path(AUTOSAVE_DIR).resolve()),
            "audiosr_available": _audiosr_available,
            "audiosr_loaded": _audiosr_model is not None}

@app.post("/preview_prompt")
def preview_prompt(req: GenRequest):
    final, neg = resolve_prompt(req.prompt, req.enhance,
                                req.enhanced_prompt_override,
                                req.negative_prompt_override)
    return {"raw": req.prompt, "enhanced": final, "negative": neg}

# ─────────────────── Chaos / Corrupt prompt generator ────────────────────────

# These fragments exploit how the T5 text encoder processes semantic meaning.
# Contradictory, cross-domain, and physically impossible descriptions create
# emergent textures the model was never explicitly trained to produce.

_CHAOS_TEXTURES = [
    "granular", "crystalline", "molten", "frozen", "shattered", "corroded",
    "submerged", "petrified", "liquefied", "evaporating", "decaying",
    "fossilized", "oxidized", "fermented", "calcified", "vitrified",
]
_CHAOS_SPACES = [
    "inside a cathedral", "underwater", "in a vacuum", "through a wall",
    "inside a metal pipe", "in a cave system", "from across a frozen lake",
    "inside a trash compactor", "through broken glass", "in zero gravity",
    "inside a concrete stairwell", "through a telephone line from 1920",
    "in an abandoned mine shaft", "inside a hollow tree",
]
_CHAOS_PROCESSES = [
    "reversed", "time-stretched", "pitch-shifted down 3 octaves",
    "convolved with feedback", "tape-saturated", "bit-crushed to 4-bit",
    "ring-modulated", "granular synthesis", "spectral freeze",
    "paulstretch", "vocoder-processed", "comb-filtered",
    "run through a broken amplifier", "played backwards at half speed",
    "resonant filter sweep", "waveshaping distortion",
]
_CHAOS_MATERIALS = [
    "metal scraping on ice", "wood resonating in water", "glass vibrating on stone",
    "paper tearing in slow motion", "ceramic crumbling", "rubber stretching",
    "bone cracking", "fabric dissolving", "plastic melting",
    "sand flowing through gears", "rust crumbling off steel", "wax dripping on coals",
]
_CHAOS_CONTRADICTIONS = [
    "deafening silence", "microscopic explosion", "gentle destruction",
    "warm freezing", "slow impact", "liquid metal breath", "soft shrapnel",
    "delicate earthquake", "tiny avalanche", "precise chaos",
    "organized noise", "clean filth", "beautiful malfunction",
]
_CHAOS_MODIFIERS = [
    "lo-fi", "extreme distortion", "pristine", "degraded analog",
    "alien", "organic machine", "haunted", "industrial",
    "ethereal", "brutal", "clinical", "feral",
]

@app.get("/chaos_prompt")
def chaos_prompt(base: str = ""):
    """Generate a chaotic/glitch prompt fragment. Optionally builds on a base prompt."""
    rng = random.Random()

    # Pick 2-4 random fragments from different categories
    parts = []
    pools = [_CHAOS_TEXTURES, _CHAOS_SPACES, _CHAOS_PROCESSES,
             _CHAOS_MATERIALS, _CHAOS_CONTRADICTIONS, _CHAOS_MODIFIERS]
    # Always pick from at least 2-3 different pools
    chosen_pools = rng.sample(pools, rng.randint(2, 4))
    for pool in chosen_pools:
        parts.append(rng.choice(pool))

    chaos = ", ".join(parts)

    if base.strip():
        # Corrupt the existing prompt by injecting chaos
        result = f"{base.strip()}, {chaos}"
    else:
        # Pure chaos — pick a material + process + space
        material = rng.choice(_CHAOS_MATERIALS)
        result = f"{material}, {chaos}"

    return {"chaos_prompt": result}

@app.post("/generate_one_shot")
def generate_one_shot(req: GenRequest):
    jid = submit_job(req.prompt, req.seconds, req.seed,
                     req.cfg_scale, req.steps, req.sampler,
                     req.enhance, req.enhanced_prompt_override,
                     req.negative_prompt_override,
                     req.audiosr, req.audiosr_steps, req.audiosr_guidance)
    return jobs[jid].model_dump()

@app.post("/generate_batch")
def generate_batch(req: BatchRequest):
    ids = []
    for _ in range(req.count):
        jid = submit_job(req.prompt, req.seconds, None,
                         req.cfg_scale, req.steps, req.sampler,
                         req.enhance, req.enhanced_prompt_override,
                         req.negative_prompt_override,
                         req.audiosr, req.audiosr_steps, req.audiosr_guidance)
        ids.append(jid)
    return {"job_ids": ids}

@app.post("/generate_matrix")
def generate_matrix(req: MatrixRequest):
    steps_list = _range_to_list(req.steps_range, 100, int)
    cfg_list = _range_to_list(req.cfg_range, 7.0, lambda v: round(v, 2))
    samplers_list = req.samplers if req.samplers else ["dpmpp-3m-sde"]
    combos_raw = list(itertools.product(steps_list, cfg_list, samplers_list))[:64]
    combos, job_ids = [], []
    for (st, cf, sa) in combos_raw:
        jid = submit_job(req.prompt, req.seconds, req.seed,
                         cf, st, sa, req.enhance,
                         req.enhanced_prompt_override, req.negative_prompt_override,
                         req.audiosr, req.audiosr_steps, req.audiosr_guidance)
        job_ids.append(jid)
        combos.append(MatrixCombo(job_id=jid, steps=st, cfg_scale=cf, sampler=sa))
    mid = uuid.uuid4().hex[:8]
    log.info(f"Matrix {mid}: {len(combos)} combos, seed={req.seed}")
    return MatrixResponse(matrix_id=mid, job_ids=job_ids, combos=combos,
                          seed=req.seed, prompt=req.prompt)

def _range_to_list(spec, default, cast):
    if not spec: return [cast(default)]
    vals = []
    v = spec.min
    while v <= spec.max + 0.001:
        vals.append(cast(v))
        v += spec.step
    return vals if vals else [cast(default)]

@app.get("/job/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs: raise HTTPException(404)
    return jobs[job_id].model_dump()

@app.get("/wav/{wav_id}")
def get_wav(wav_id: str):
    safe = wav_id.replace("/","").replace("\\","").replace("..","")
    path = OUTPUT_DIR / f"{safe}.wav"
    if not path.exists(): raise HTTPException(404)
    return FileResponse(str(path), media_type="audio/wav", filename=f"{safe}.wav")

# ═══════════════════════════════════════════════════════════════════════════════
# Entry
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    save_dir = Path(AUTOSAVE_DIR).resolve()
    print()
    print("  ═══════════════════════════════════════")
    print("       ◈ FOLEY STUDIO — backend v4")
    print("  ═══════════════════════════════════════")
    print(f"  Model:    {'⚠ MOCK' if MOCK_MODE else '✓ ' + ACTIVE_MODEL}")
    print(f"  GPU:      {'✓ ' + _device if GPU_AVAILABLE else '✗ CPU'}")
    print(f"  Rate:     {SAMPLE_RATE} Hz")
    print(f"  AudioSR:  {'✓ installed' if _audiosr_available else '✗ not installed'}")
    print(f"  Autosave: {save_dir}")
    print(f"  URL:      http://localhost:8910")
    print("  ═══════════════════════════════════════")
    if MOCK_MODE and not CKPT_PATH:
        print()
        print("  ⚠ No model path set!")
        print("  Open config.txt and paste your .safetensors path")
        print("  into the MODEL_PATH line, then restart.")
    elif MOCK_MODE:
        print()
        print(f"  ⚠ Model file not found at:")
        print(f"    {CKPT_PATH}")
        print("  Check the path in config.txt and restart.")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8910, log_level="info")
