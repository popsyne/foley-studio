# ☉ Foley Studio — Sound Forge

Local AI foley, SFX, and instrument one-shot generator powered by [Stable Audio Open 1.0](https://huggingface.co/stabilityai/stable-audio-open-1.0).

Runs entirely on your machine. No cloud, no API keys, no subscriptions. Generated sounds save straight to a folder you choose, with parameters embedded in the filename and WAV metadata — drop them into FL Studio, Ableton, Reaper, or anything else.

![status](https://img.shields.io/badge/status-working-brightgreen) ![python](https://img.shields.io/badge/python-3.10%20%7C%203.11-blue) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it does

- **Text-to-sound** — describe a sound, get a clip. 45+ foley presets included.
- **Instrument one-shots** — 22 instrument presets with note / octave / chord selection.
- **Parameter Matrix** — batch-render a grid of steps × CFG × sampler combinations to A/B compare, with gapless sequential playback and a highlight on the currently playing pad.
- **⚡ Corrupt / Pure Chaos** — inject glitch fragments into prompts for unpredictable, texture-rich results. This is a glitch machine as much as a foley tool.
- **AudioSR (optional)** — upscale output to 48 kHz with diffusion-based super-resolution.
- **Auto-save** — every render lands in your output folder with a descriptive filename and embedded metadata.
- **Stone-tablet UI** — because why not.

---

## Requirements

| | Minimum | Recommended |
|---|---|---|
| OS | Windows 10/11 | Windows 11 |
| GPU | NVIDIA, 8 GB VRAM | RTX 4080 / 4090 |
| RAM | 16 GB | 32 GB |
| Python | 3.10 or 3.11 | 3.11 |
| Node.js | 18+ | 20+ |
| Disk | ~10 GB free | — |

> **No NVIDIA GPU?** It will run on CPU but each generation takes minutes instead of seconds. Not recommended.

---

## Quick start

### 1. Get the code

```
git clone https://github.com/YOUR_USERNAME/foley-studio.git
cd foley-studio
```

Or download the ZIP from the green **Code** button and extract it somewhere permanent — **not** Downloads, Desktop, or a OneDrive-synced folder (these can corrupt the Python environment).

### 2. Get the model

Download the model file (~4.9 GB, no account needed):

**[stabilityai/stable-audio-open-1.0 → model.safetensors](https://huggingface.co/stabilityai/stable-audio-open-1.0/resolve/main/model.safetensors)**

Already have it from ComfyUI or another tool? You can reuse that file — no need to download again.

### 3. Tell Foley Studio where the model is

Open **`config.txt`** in the project folder and paste the full path:

```
MODEL_PATH = D:\models\stable-audio-open-1.0.safetensors
```

Save the file.

### 4. Install dependencies

Double-click **`INSTALL_MODEL.bat`**. This creates a Python environment and installs PyTorch (CUDA build) + stable-audio-tools. First run downloads ~3.5 GB total — be patient.

### 5. Run it

You need **two windows** open at the same time:

1. Double-click **`START_BACKEND.bat`** — wait for `✓ Loaded on cuda`
2. Double-click **`START_FRONTEND.bat`** — wait for the Vite URL
3. Open **http://localhost:5173** in your browser

That's it.

---

## Optional: AudioSR 48 kHz upscaling

Stable Audio Open outputs at 44.1 kHz with somewhat soft high frequencies. AudioSR upscales to 48 kHz and reconstructs high-frequency detail using a separate diffusion model. To enable it:

```
backend\venv\Scripts\pip.exe install audiosr==0.0.7
```

Restart the backend. An **✦ AudioSR** toggle appears in the UI with steps and guidance controls. The model (~2 GB) downloads automatically the first time you use it.

---

## Configuration

Everything is in **`config.txt`**:

```
MODEL_PATH = path to your .safetensors file
OUTPUT_DIR = where to save generated sounds (blank = default folder)
```

Environment variables (`CKPT_PATH`, `FOLEY_OUTPUT_DIR`, `AUDIOSR_ENABLED`, `AUDIOSR_MODEL`) override the file if set.

---

## Tips

- **CFG Scale** — prompt adherence. 3–5 loose/creative, 7 balanced, 10+ strict but can sound harsh.
- **Steps** — 50 is a fast preview, 100 is balanced, 150+ has diminishing returns.
- **Samplers** — `dpmpp-3m-sde` is the best all-rounder. `k-dpm-2` gives sharper transients.
- **Corrupt button** — start with a normal prompt, hit Corrupt a few times, generate. Great for impacts, risers, and weird textures.
- **Matrix mode** — leave the prompt fixed and sweep steps/CFG to find the sweet spot for a given sound, then reproduce it in the Generate tab with the same seed.
- Instrument and ambient prompts automatically get smarter negative prompts (no "no melody" on an instrument).

---

## Troubleshooting

**"MOCK MODE" / no real audio**
The model path in `config.txt` is wrong or the file isn't there. The backend window prints the path it tried — check it.

**`Fatal error in launcher` when running pip**
The Python environment broke, usually from moving the project folder after install. Delete `backend\venv`, then run `INSTALL_MODEL.bat` again.

**Packages install but aren't found**
You installed into system Python instead of the project's environment. Always use `backend\venv\Scripts\pip.exe install ...` or activate the venv first.

**`flash_attn not installed`**
Harmless. It's an optional speedup; the model works fine without it.

**CUDA out of memory**
Lower the duration or steps, or disable AudioSR. AudioSR + Stable Audio together need ~8 GB; on a 16 GB card they coexist fine, on 8 GB it's tight.

**Output is shorter/longer than requested**
Fixed in current version — output is padded/trimmed to exactly your requested duration, including after AudioSR.

---

## How it works

- **Backend** — FastAPI server (`backend/server.py`) wrapping stable-audio-tools. Handles generation jobs, post-processing (trim, fade, normalize, optional AudioSR), auto-save with metadata.
- **Frontend** — React + Vite single-page app. Talks to the backend over HTTP, polls job status, renders waveforms with wavesurfer.js.
- The model is loaded once at startup and kept in VRAM. Jobs run on a thread pool.

---

## Credits

- [Stable Audio Open 1.0](https://huggingface.co/stabilityai/stable-audio-open-1.0) by Stability AI
- [stable-audio-tools](https://github.com/Stability-AI/stable-audio-tools)
- [AudioSR](https://github.com/haoheliu/versatile_audio_super_resolution) by Haohe Liu et al.

Model weights are subject to the [Stability AI Community License](https://huggingface.co/stabilityai/stable-audio-open-1.0). This app's own code is MIT.

---

## License

MIT — see [LICENSE](LICENSE). Model weights are **not** included and carry their own license.
