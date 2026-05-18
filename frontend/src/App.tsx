import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as api from "./api";
import type {
  JobResponse, GenerateParams, HealthResponse, JobStatus,
  MatrixCombo, MatrixParams, PromptPreview,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const SAMPLERS = ["dpmpp-3m-sde", "dpmpp-2m-sde", "k-dpm-2", "k-heun"] as const;

const STYLE_TAGS: { label: string; tag: string }[] = [
  { label: "dry", tag: "dry, close-miked, anechoic" },
  { label: "close", tag: "extremely close-miked, intimate" },
  { label: "distant", tag: "distant, roomy, ambient" },
  { label: "hard transient", tag: "sharp, punchy, fast attack" },
  { label: "soft", tag: "gentle, soft, delicate" },
  { label: "lo-fi", tag: "lo-fi, degraded, vintage tape" },
  { label: "bright", tag: "bright, airy, crisp" },
  { label: "dark", tag: "dark, muffled, bassy" },
  { label: "reverb", tag: "reverb, spacious, large hall" },
  { label: "compressed", tag: "compressed, tight, loud" },
  { label: "saturated", tag: "saturated, warm distortion" },
  { label: "cinematic", tag: "cinematic, dramatic, layered" },
  { label: "organic", tag: "organic, natural, raw" },
  { label: "synthetic", tag: "synthetic, digital, processed" },
  { label: "stereo wide", tag: "wide stereo field, spacious" },
];

const FOLEY_PRESETS: { category: string; items: { label: string; prompt: string }[] }[] = [
  { category: "Impacts", items: [
    { label: "punch", prompt: "fist punch impact on body" },
    { label: "slam", prompt: "heavy door slam" },
    { label: "crash", prompt: "car crash metal collision" },
    { label: "thud", prompt: "heavy object falling on floor thud" },
    { label: "explosion", prompt: "distant explosion boom" },
  ]},
  { category: "Footsteps", items: [
    { label: "wood", prompt: "single footstep on wooden floor" },
    { label: "gravel", prompt: "footstep on gravel" },
    { label: "concrete", prompt: "footstep on concrete" },
    { label: "snow", prompt: "footstep crunching in snow" },
    { label: "puddle", prompt: "footstep splashing in puddle" },
  ]},
  { category: "Doors & Mechanical", items: [
    { label: "door open", prompt: "door opening creak" },
    { label: "door close", prompt: "door closing latch click" },
    { label: "lock", prompt: "key turning in lock mechanism" },
    { label: "switch", prompt: "light switch click" },
    { label: "lever", prompt: "heavy metal lever pull" },
  ]},
  { category: "Water & Liquid", items: [
    { label: "drip", prompt: "single water drip into basin" },
    { label: "splash", prompt: "water splash" },
    { label: "pour", prompt: "water pouring from glass" },
    { label: "rain", prompt: "rain falling on roof" },
    { label: "bubble", prompt: "underwater bubbles" },
  ]},
  { category: "Glass & Ceramic", items: [
    { label: "shatter", prompt: "glass shattering on floor" },
    { label: "clink", prompt: "two glasses clinking" },
    { label: "tap", prompt: "fingernail tapping on glass" },
    { label: "crack", prompt: "ceramic plate cracking" },
  ]},
  { category: "Metal", items: [
    { label: "clang", prompt: "metal pipe clang" },
    { label: "scrape", prompt: "metal scraping on concrete" },
    { label: "ring", prompt: "metal bell ringing" },
    { label: "chain", prompt: "chain links rattling" },
    { label: "sword", prompt: "sword unsheathing ring" },
  ]},
  { category: "Nature & Ambience", items: [
    { label: "wind", prompt: "wind blowing through trees" },
    { label: "thunder", prompt: "distant thunder rumble" },
    { label: "leaves", prompt: "dry leaves rustling" },
    { label: "fire", prompt: "campfire crackling" },
    { label: "birds", prompt: "forest birds chirping" },
  ]},
  { category: "UI & Tech", items: [
    { label: "click", prompt: "button click interface" },
    { label: "beep", prompt: "electronic beep notification" },
    { label: "error", prompt: "error buzzer" },
    { label: "whoosh", prompt: "UI transition whoosh" },
    { label: "power up", prompt: "device power up boot" },
  ]},
  { category: "Body & Cloth", items: [
    { label: "breath", prompt: "heavy breath exhale" },
    { label: "clap", prompt: "single hand clap" },
    { label: "snap", prompt: "finger snap" },
    { label: "rustle", prompt: "cloth fabric rustling" },
    { label: "tear", prompt: "fabric tearing rip" },
  ]},
  { category: "Vehicles", items: [
    { label: "engine", prompt: "car engine starting" },
    { label: "screech", prompt: "tire screech on asphalt" },
    { label: "horn", prompt: "car horn honk" },
    { label: "pass by", prompt: "car passing by on road" },
  ]},
];

const INSTRUMENT_PRESETS: { label: string; prompt: string }[] = [
  { label: "piano", prompt: "piano note" },
  { label: "electric piano", prompt: "electric piano Rhodes note" },
  { label: "acoustic guitar", prompt: "acoustic guitar pluck note" },
  { label: "electric guitar", prompt: "electric guitar note clean" },
  { label: "distorted guitar", prompt: "distorted electric guitar power chord" },
  { label: "bass guitar", prompt: "electric bass guitar note" },
  { label: "upright bass", prompt: "upright acoustic bass pluck note" },
  { label: "violin", prompt: "violin bowed note" },
  { label: "cello", prompt: "cello bowed note" },
  { label: "trumpet", prompt: "trumpet note" },
  { label: "saxophone", prompt: "saxophone note" },
  { label: "flute", prompt: "flute note" },
  { label: "synth pad", prompt: "synthesizer pad chord" },
  { label: "synth lead", prompt: "synthesizer lead note" },
  { label: "synth bass", prompt: "synthesizer bass note" },
  { label: "organ", prompt: "Hammond organ chord" },
  { label: "marimba", prompt: "marimba mallet hit note" },
  { label: "harp", prompt: "harp pluck note" },
  { label: "kick drum", prompt: "kick drum hit" },
  { label: "snare drum", prompt: "snare drum hit" },
  { label: "hi-hat", prompt: "hi-hat cymbal hit" },
  { label: "crash cymbal", prompt: "crash cymbal hit" },
];

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OCTAVES = ["2", "3", "4", "5", "6"];
const CHORDS = ["major", "minor", "7th", "maj7", "min7", "dim", "aug", "sus4", "sus2"];

// ═══════════════════════════════════════════════════════════════════════════════
// Stone Bevel CSS Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const STONE_BG = "linear-gradient(145deg, #5a5248 0%, #3d3830 30%, #2e2a24 70%, #1f1c18 100%)";
const STONE_RAISED = "inset 0 1px 0 rgba(255,220,170,0.15), inset 0 -1px 0 rgba(0,0,0,0.4), 2px 2px 6px rgba(0,0,0,0.5), -1px -1px 3px rgba(180,160,120,0.08)";
const STONE_INSET = "inset 2px 2px 5px rgba(0,0,0,0.6), inset -1px -1px 3px rgba(180,160,120,0.1)";
const BEVEL_BTN = "inset 0 1px 0 rgba(255,220,170,0.2), inset 0 -1px 0 rgba(0,0,0,0.5), 1px 1px 4px rgba(0,0,0,0.4)";
const BEVEL_BTN_PRESS = "inset 2px 2px 4px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(180,160,120,0.1)";
const GOLD_GLOW = "0 0 8px rgba(212,175,85,0.4)";
const SERIF_FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif";
const MONO_FONT = "'Courier New', Courier, monospace";

// ═══════════════════════════════════════════════════════════════════════════════
// Waveform Player
// ═══════════════════════════════════════════════════════════════════════════════

function WaveformPlayer({ wavUrl, height = 56 }: { wavUrl: string; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ws: any = null;
    let cancelled = false;
    (async () => {
      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;
        if (cancelled || !containerRef.current) return;
        ws = WaveSurfer.create({
          container: containerRef.current,
          waveColor: "#8a7a5a", progressColor: "#d4af55",
          cursorColor: "#d4af55",
          barWidth: 2, barGap: 1, barRadius: 1,
          height, normalize: true, backend: "WebAudio",
        });
        ws.load(wavUrl);
        ws.on("ready", () => { if (!cancelled) setReady(true); });
        ws.on("finish", () => setPlaying(false));
        ws.on("error", () => { if (!cancelled) setFailed(true); });
        wsRef.current = ws;
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; ws?.destroy(); };
  }, [wavUrl, height]);

  const toggle = useCallback(() => {
    if (wsRef.current) { wsRef.current.playPause(); setPlaying(p => !p); }
  }, []);

  if (failed) return <audio controls src={wavUrl} style={{ width: "100%", height: 32 }} />;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={toggle}>
      <span style={{ fontSize: 14, color: playing ? "#d4af55" : "#8a7a5a", width: 18, textAlign: "center", flexShrink: 0 }}>
        {playing ? "⏸" : "▶"}
      </span>
      <div ref={containerRef} style={{ flex: 1, minWidth: 0 }} />
      {!ready && <span style={{ color: "#555", fontSize: 10 }}>…</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Clip Card
// ═══════════════════════════════════════════════════════════════════════════════

function ClipCard({ job }: { job: JobResponse }) {
  const [showMeta, setShowMeta] = useState(false);
  const [copied, setCopied] = useState(false);
  const wUrl = job.wav_id ? api.wavUrl(job.wav_id) : null;

  const copyMeta = () => {
    if (job.meta) {
      navigator.clipboard.writeText(JSON.stringify(job.meta, null, 2));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div style={S.clipCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={S.tag}>seed {job.meta?.seed ?? "?"}</span>
          <span style={S.tag}>{job.meta?.duration_out.toFixed(2)}s</span>
          <span style={S.tag}>cfg {job.meta?.cfg_scale}</span>
          <span style={S.tag}>{job.meta?.steps} steps</span>
          <span style={S.tag}>{job.meta?.sampler}</span>
          {job.is_mock && <span style={{ ...S.tag, backgroundColor: "#4a3a1a", color: "#d4af55" }}>MOCK</span>}
          {job.meta?.audiosr_applied && <span style={{ ...S.tag, backgroundColor: "#1a3a4a", color: "#55bfd4" }}>48kHz ✦</span>}
        </div>
        <span style={{ fontSize: 10, color: "#5a5248", fontFamily: MONO_FONT }}>auto-saved ✓</span>
      </div>
      {wUrl && <WaveformPlayer wavUrl={wUrl} />}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {wUrl && <a href={wUrl} download style={S.smallBtn}>↓ WAV</a>}
        <button onClick={copyMeta} style={S.smallBtn}>{copied ? "✓" : "⎘"} Meta</button>
        <button onClick={() => setShowMeta(!showMeta)} style={S.smallBtn}>
          {showMeta ? "▾ Hide" : "▸ Details"}
        </button>
      </div>
      {showMeta && job.meta && (
        <div style={S.metaBlock}>
          <div><b>Raw:</b> {job.meta.raw_prompt}</div>
          <div><b>Sent:</b> {job.meta.enhanced_prompt}</div>
          {job.meta.negative_prompt && <div><b>Neg:</b> {job.meta.negative_prompt}</div>}
          <div>peak {job.meta.peak_dbfs} dBFS · rms {job.meta.rms_db} dB · onset {job.meta.onset_time_estimate}s</div>
          {job.meta.saved_path && <div style={{ color: "#8a7a5a" }}>→ {job.meta.saved_path}</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Progress Bar
// ═══════════════════════════════════════════════════════════════════════════════

function ProgressBar({ progress, status }: { progress: number; status: JobStatus }) {
  const pct = Math.round(progress * 100);
  const color = status === "error" ? "#8b3030" : status === "done" ? "#d4af55" : "#8a7a5a";
  return (
    <div style={S.progressOuter}>
      <div style={{ ...S.progressInner, width: `${pct}%`, backgroundColor: color }} />
      <span style={S.progressText}>
        {status === "error" ? "ERR" : status === "done" ? "✓" : `${pct}%`}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slider + Number Input combo
// ═══════════════════════════════════════════════════════════════════════════════

function SliderNum({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.label}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ ...S.slider, flex: 1 }} />
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          style={{ ...S.numInput, width: 64, textAlign: "center" as const }} />
        {unit && <span style={{ fontSize: 11, color: "#8a7a5a", fontFamily: MONO_FONT }}>{unit}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Range Input (matrix)
// ═══════════════════════════════════════════════════════════════════════════════

function RangeInput({ label, value, onChange, step: st, minVal, maxVal }: {
  label: string;
  value: { min: number; max: number; step: number };
  onChange: (v: { min: number; max: number; step: number }) => void;
  step?: number; minVal?: number; maxVal?: number;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={S.labelSm}>{label}</label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {(["min", "max", "step"] as const).map(k => (
          <React.Fragment key={k}>
            <label style={S.microLabel}>{k === "step" ? "interval" : k}</label>
            <input type="number" value={value[k]} step={st || 1}
              min={k === "step" ? (st || 1) : minVal} max={maxVal}
              onChange={e => onChange({ ...value, [k]: parseFloat(e.target.value) || 0 })}
              style={{ ...S.numInput, width: 60 }} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sequential Player for matrix
// ═══════════════════════════════════════════════════════════════════════════════

function useSequentialPlayer(wavUrls: string[]) {
  const [playingIdx, setPlayingIdx] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef(wavUrls);
  urlsRef.current = wavUrls;
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (nextAudioRef.current) { nextAudioRef.current = null; }
    setPlayingIdx(-1);
  }, []);

  const playFrom = useCallback((idx: number) => {
    // If we had a preloaded next clip, use it directly (no gap)
    if (nextAudioRef.current && idx > 0) {
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = nextAudioRef.current;
      nextAudioRef.current = null;
      audioRef.current = audio;
      setPlayingIdx(idx);
      audio.play();
      // Preload the one after this
      if (idx + 1 < urlsRef.current.length) {
        const next = new Audio(urlsRef.current[idx + 1]);
        next.preload = "auto";
        nextAudioRef.current = next;
      }
      audio.onended = () => playFrom(idx + 1);
      audio.onerror = () => playFrom(idx + 1);
      return;
    }

    stop();
    if (idx < 0 || idx >= urlsRef.current.length) { setPlayingIdx(-1); return; }
    const audio = new Audio(urlsRef.current[idx]);
    audioRef.current = audio;
    setPlayingIdx(idx);
    // Preload next clip while this one plays
    if (idx + 1 < urlsRef.current.length) {
      const next = new Audio(urlsRef.current[idx + 1]);
      next.preload = "auto";
      nextAudioRef.current = next;
    }
    audio.play();
    audio.onended = () => playFrom(idx + 1);
    audio.onerror = () => playFrom(idx + 1);
  }, [stop]);

  const playAll = useCallback(() => playFrom(0), [playFrom]);
  return { playAll, stop, playingIdx, isPlaying: playingIdx >= 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════════════════════════════════

type TabMode = "generate" | "matrix";

export default function App() {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabMode>("generate");

  // Shared prompt state
  const [prompt, setPrompt] = useState("wooden door slam");
  const [enhance, setEnhance] = useState(true);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [editedEnhanced, setEditedEnhanced] = useState<string | null>(null);
  const [editedNeg, setEditedNeg] = useState<string | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptPreview, setPromptPreview] = useState<PromptPreview | null>(null);

  // Instrument mode
  const [showInstruments, setShowInstruments] = useState(false);
  const [instNote, setInstNote] = useState("C");
  const [instOctave, setInstOctave] = useState("4");
  const [instChord, setInstChord] = useState("");

  // Generate params
  const [seconds, setSeconds] = useState(2.0);
  const [seed, setSeed] = useState("");
  const [randomizeAfter, setRandomizeAfter] = useState(true);
  const [doAudioSR, setDoAudioSR] = useState(false);
  const [audiosrSteps, setAudiosrSteps] = useState(50);
  const [audiosrGuidance, setAudiosrGuidance] = useState(3.5);
  const [cfgScale, setCfgScale] = useState(7.0);
  const [steps, setSteps] = useState(100);
  const [sampler, setSampler] = useState("dpmpp-3m-sde");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFoley, setShowFoley] = useState(false);

  // Jobs
  const [generating, setGenerating] = useState(false);
  const [activeJobs, setActiveJobs] = useState<string[]>([]);
  const [completedJobs, setCompletedJobs] = useState<JobResponse[]>([]);
  const jobCache = useRef<Map<string, JobResponse>>(new Map());

  // Matrix state
  const [matStepsRange, setMatStepsRange] = useState({ min: 4, max: 10, step: 2 });
  const [matCfgRange, setMatCfgRange] = useState({ min: 5, max: 11, step: 2 });
  const [matSamplers, setMatSamplers] = useState<Set<string>>(new Set(["dpmpp-3m-sde"]));
  const [matSeed, setMatSeed] = useState("");
  const [matResults, setMatResults] = useState<{
    combos: (MatrixCombo & { job?: JobResponse })[];
    seed: number; samplers: string[];
  } | null>(null);
  const [matFilterSampler, setMatFilterSampler] = useState<string | null>(null);
  const [matGenerating, setMatGenerating] = useState(false);
  const [matShowPrompt, setMatShowPrompt] = useState(false);

  // Health
  useEffect(() => {
    api.health().then(setHealthData).catch(e => setHealthError(e.message));
  }, []);

  // Composed prompt
  const fullPrompt = useMemo(() => {
    const tags = Array.from(activeTags);
    return tags.length ? prompt + ", " + tags.join(", ") : prompt;
  }, [prompt, activeTags]);

  // Preview (debounced)
  const previewTimer = useRef<any>(null);
  useEffect(() => {
    if (!showPromptEditor && !matShowPrompt) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      api.previewPrompt(fullPrompt, enhance, editedEnhanced, editedNeg)
        .then(p => {
          setPromptPreview(p);
          if (editedEnhanced === null) setEditedEnhanced(p.enhanced);
          if (editedNeg === null) setEditedNeg(p.negative);
        }).catch(() => {});
    }, 400);
  }, [fullPrompt, enhance, showPromptEditor, matShowPrompt]);

  useEffect(() => { setEditedEnhanced(null); setEditedNeg(null); }, [enhance]);

  const toggleTag = (tag: string) => {
    setActiveTags(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });
  };

  const applyInstrument = (instPrompt: string) => {
    const noteStr = instChord ? `${instNote}${instOctave} ${instChord} chord` : `${instNote}${instOctave}`;
    setPrompt(`${instPrompt}, ${noteStr}`);
  };

  const appendToPrompt = (text: string) => {
    setPrompt(prev => prev.trim() ? `${prev.trim()}, ${text}` : text);
  };

  const handleChaos = async () => {
    try {
      const result = await api.chaosPrompt(prompt.trim());
      setPrompt(result.chaos_prompt);
    } catch { /* ignore */ }
  };

  const randomSeed = () => setSeed(String(Math.floor(Math.random() * 2147483647)));
  const randomMatSeed = () => setMatSeed(String(Math.floor(Math.random() * 2147483647)));

  // Polling
  const startPolling = useCallback((jobIds: string[], onAllDone?: () => void) => {
    setActiveJobs(prev => [...prev, ...jobIds]);
    setGenerating(true);
    const pending = new Set(jobIds);
    const id = setInterval(async () => {
      for (const jid of Array.from(pending)) {
        try {
          const j = await api.pollJob(jid);
          jobCache.current.set(jid, j);
          if (j.status === "done" || j.status === "error") {
            pending.delete(jid);
            if (j.status === "done") setCompletedJobs(prev => [j, ...prev]);
          }
        } catch {}
      }
      setActiveJobs(prev => [...prev]);
      if (pending.size === 0) {
        clearInterval(id);
        setActiveJobs(prev => prev.filter(x => !jobIds.includes(x)));
        setGenerating(false);
        onAllDone?.();
      }
    }, 600);
  }, []);

  // Generate
  const buildParams = (): GenerateParams => ({
    prompt: fullPrompt, seconds,
    seed: seed ? parseInt(seed, 10) : null,
    cfg_scale: cfgScale, steps, sampler, enhance,
    enhanced_prompt_override: (enhance && editedEnhanced !== null) ? editedEnhanced : null,
    negative_prompt_override: (enhance && editedNeg !== null) ? editedNeg : null,
    audiosr: doAudioSR,
    audiosr_steps: audiosrSteps,
    audiosr_guidance: audiosrGuidance,
  });

  const handleGenerate = async () => {
    try {
      const job = await api.generateOneShot(buildParams());
      startPolling([job.job_id], () => { if (randomizeAfter) randomSeed(); });
    } catch (e: any) { alert(e.message); }
  };

  const handleBatch = async () => {
    try {
      const batch = await api.generateBatch(buildParams(), 8);
      startPolling(batch.job_ids, () => { if (randomizeAfter) randomSeed(); });
    } catch (e: any) { alert(e.message); }
  };

  // Matrix
  const matComboCount = useMemo(() => {
    const sc = Math.max(1, Math.floor((matStepsRange.max - matStepsRange.min) / matStepsRange.step) + 1);
    const cc = Math.max(1, Math.floor((matCfgRange.max - matCfgRange.min) / matCfgRange.step) + 1);
    return Math.min(sc * cc * Math.max(1, matSamplers.size), 64);
  }, [matStepsRange, matCfgRange, matSamplers]);

  const handleMatrixGenerate = async () => {
    const seedVal = matSeed ? parseInt(matSeed, 10) : Math.floor(Math.random() * 2147483647);
    if (!matSeed) setMatSeed(String(seedVal));
    const params: MatrixParams = {
      prompt: fullPrompt, seconds, seed: seedVal, enhance,
      enhanced_prompt_override: (enhance && editedEnhanced !== null) ? editedEnhanced : null,
      negative_prompt_override: (enhance && editedNeg !== null) ? editedNeg : null,
      steps_range: matStepsRange, cfg_range: matCfgRange,
      samplers: Array.from(matSamplers),
      audiosr: doAudioSR,
      audiosr_steps: audiosrSteps,
      audiosr_guidance: audiosrGuidance,
    };
    try {
      setMatGenerating(true);
      const res = await api.generateMatrix(params);
      const samps = [...new Set(res.combos.map(c => c.sampler))];
      setMatFilterSampler(samps[0] || null);
      setMatResults({ combos: res.combos.map(c => ({ ...c })), seed: res.seed, samplers: samps });
      const pending = new Set(res.job_ids);
      const pid = setInterval(async () => {
        for (const jid of Array.from(pending)) {
          try {
            const j = await api.pollJob(jid);
            jobCache.current.set(jid, j);
            if (j.status === "done" || j.status === "error") pending.delete(jid);
          } catch {}
        }
        setMatResults(prev => prev ? {
          ...prev,
          combos: prev.combos.map(c => ({ ...c, job: jobCache.current.get(c.job_id) || c.job })),
        } : prev);
        if (pending.size === 0) { clearInterval(pid); setMatGenerating(false); }
      }, 600);
    } catch (e: any) { alert(e.message); setMatGenerating(false); }
  };

  const activeJobStates = activeJobs.map(
    id => jobCache.current.get(id) ?? { job_id: id, status: "queued" as JobStatus, progress: 0 } as JobResponse
  );

  const matrixGrid = useMemo(() => {
    if (!matResults || !matFilterSampler) return null;
    const filtered = matResults.combos.filter(c => c.sampler === matFilterSampler);
    const stepsVals = [...new Set(filtered.map(c => c.steps))].sort((a, b) => a - b);
    const cfgVals = [...new Set(filtered.map(c => c.cfg_scale))].sort((a, b) => a - b);
    const grid = stepsVals.map(st => cfgVals.map(cf => filtered.find(c => c.steps === st && c.cfg_scale === cf) || null));
    return { stepsVals, cfgVals, grid };
  }, [matResults, matFilterSampler]);

  const matrixWavIds = useMemo(() => {
    if (!matResults || !matFilterSampler) return [];
    return matResults.combos
      .filter(c => c.sampler === matFilterSampler && c.job?.wav_id)
      .map(c => c.job!.wav_id!);
  }, [matResults, matFilterSampler]);

  const matrixWavUrls = useMemo(() => {
    return matrixWavIds.map(id => api.wavUrl(id));
  }, [matrixWavIds]);

  const seqPlayer = useSequentialPlayer(matrixWavUrls);

  // Which wav_id is currently playing in sequential mode?
  const playingWavId = seqPlayer.playingIdx >= 0 && seqPlayer.playingIdx < matrixWavIds.length
    ? matrixWavIds[seqPlayer.playingIdx] : null;

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div style={S.root}>
      {/* ═══ HEADER — stone tablet style ═══ */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28, color: "#d4af55", textShadow: "0 0 10px rgba(212,175,85,0.6)" }}>☉</span>
          <div>
            <h1 style={S.title}>FOLEY STUDIO</h1>
            <div style={S.subtitle}>◆ S O U N D &nbsp; F O R G E ◆</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {healthData?.mock_mode && <span style={S.badgeWarn}>⚠ SIMULACRA</span>}
          {healthData && !healthData.mock_mode && <span style={S.badgeOk}>✦ {healthData.model_id}</span>}
          {healthData && (
            <span style={{ fontSize: 12, color: healthData.gpu_available ? "#d4af55" : "#8b6030", fontFamily: MONO_FONT }}>
              ● {healthData.gpu_available ? "GPU" : "CPU"}
            </span>
          )}
          {healthData && (
            <span style={{ fontSize: 11, color: healthData.audiosr_available ? "#55bfd4" : "#3d3830", fontFamily: MONO_FONT }}>
              {healthData.audiosr_available ? "✦ AudioSR" : ""}
            </span>
          )}
          {healthError && <span style={{ color: "#8b3030", fontSize: 12, fontFamily: SERIF_FONT }}>⊘ offline</span>}
        </div>
      </header>

      {/* Autosave banner */}
      {healthData?.autosave_dir && (
        <div style={S.autosaveBanner}>
          ↳ scrolls preserved unto: {healthData.autosave_dir}
        </div>
      )}

      {/* ═══ TABS — stone tablet buttons ═══ */}
      <div style={S.tabBar}>
        <button style={tab === "generate" ? S.tabActive : S.tabBtn} onClick={() => setTab("generate")}>
          ☉ Generate
        </button>
        <button style={tab === "matrix" ? S.tabActive : S.tabBtn} onClick={() => setTab("matrix")}>
          ▦ Parameter Matrix
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* GENERATE TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {tab === "generate" && (
        <div style={S.layout}>
          <div style={S.controlPanel}>
            {/* Prompt */}
            <label style={S.label}>⌂ Invocation</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="describe a sound to conjure…" rows={3} style={S.textarea} maxLength={500} />

            {/* Prompt actions row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
              <button onClick={handleChaos} style={S.chaosBtn} title="Inject chaotic/glitch fragments into the prompt">
                ⚡ Corrupt
              </button>
              <button onClick={async () => {
                try {
                  const result = await api.chaosPrompt("");
                  setPrompt(result.chaos_prompt);
                } catch { /* ignore */ }
              }} style={{ ...S.chaosBtn, background: "linear-gradient(145deg, #2a1430, #1a0a20)", border: "2px solid #4a1a5a", color: "#c06aff" }}
                title="Generate a fully random glitch prompt from scratch">
                ⚡⚡ Pure Chaos
              </button>
              {prompt.trim() && (
                <button onClick={() => setPrompt("")} style={S.linkBtn} title="Clear prompt">✕ clear</button>
              )}
            </div>
            <div style={{ fontSize: 10, color: "#5a4838", fontFamily: MONO_FONT, fontStyle: "italic", marginBottom: 4 }}>
              Corrupt injects glitch fragments into your prompt. Pure Chaos starts from nothing.
            </div>

            {/* Enhance toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
              <label style={S.checkLabel}>
                <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} />
                Enhance Invocation
              </label>
              <button style={S.linkBtn} onClick={() => setShowPromptEditor(!showPromptEditor)}>
                {showPromptEditor ? "hide editor ▾" : "edit what's sent →"}
              </button>
            </div>

            {/* Prompt editor */}
            {showPromptEditor && (
              <div style={S.editorBox}>
                <label style={S.microLabel}>POSITIVE (sent to model):</label>
                {enhance ? (
                  <textarea value={editedEnhanced ?? promptPreview?.enhanced ?? "loading…"}
                    onChange={e => setEditedEnhanced(e.target.value)}
                    rows={3} style={{ ...S.textarea, fontSize: 12 }} />
                ) : (
                  <div style={{ fontSize: 12, color: "#8a7a5a", padding: "6px 0", fontFamily: MONO_FONT }}>
                    {fullPrompt} <span style={{ color: "#555" }}>(enhance off — raw prompt)</span>
                  </div>
                )}
                <label style={{ ...S.microLabel, marginTop: 8 }}>NEGATIVE:</label>
                {enhance ? (
                  <textarea value={editedNeg ?? promptPreview?.negative ?? "loading…"}
                    onChange={e => setEditedNeg(e.target.value)}
                    rows={2} style={{ ...S.textarea, fontSize: 12, color: "#8b6030" }} />
                ) : (
                  <div style={{ fontSize: 12, color: "#555", padding: "6px 0", fontFamily: MONO_FONT }}>
                    (none — enhance off)
                  </div>
                )}
                {enhance && editedEnhanced !== null && (
                  <button style={{ ...S.linkBtn, marginTop: 4 }}
                    onClick={() => { setEditedEnhanced(null); setEditedNeg(null); }}>
                    ↺ reset to auto
                  </button>
                )}
              </div>
            )}

            {/* Style Tags */}
            <label style={S.label}>⚒ Style Runes <span style={{ fontWeight: 400, color: "#6a5a4a", fontSize: 11 }}>(appended)</span></label>
            <div style={S.tagGrid}>
              {STYLE_TAGS.map(({ label, tag }) => (
                <button key={label} onClick={() => toggleTag(tag)}
                  style={activeTags.has(tag) ? S.tagBtnActive : S.tagBtn}>
                  {label}
                </button>
              ))}
            </div>
            {activeTags.size > 0 && (
              <div style={{ fontSize: 11, color: "#8a7a5a", marginTop: 4, fontFamily: MONO_FONT }}>
                + {Array.from(activeTags).join(", ")}
              </div>
            )}

            {/* Foley Presets */}
            <button style={S.sectionToggle} onClick={() => setShowFoley(!showFoley)}>
              {showFoley ? "▾" : "▸"} Foley Presets <span style={{ fontWeight: 400, color: "#6a5a4a", fontSize: 10 }}>(click to append, shift+click to replace)</span>
            </button>
            {showFoley && (
              <div style={S.presetPanel}>
                {FOLEY_PRESETS.map(cat => (
                  <div key={cat.category} style={{ marginBottom: 8 }}>
                    <div style={S.presetCat}>{cat.category}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cat.items.map(it => (
                        <button key={it.label} style={S.presetBtn}
                          onClick={(e) => e.shiftKey ? setPrompt(it.prompt) : appendToPrompt(it.prompt)}
                          title={it.prompt}>
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Instrument Presets */}
            <button style={S.sectionToggle} onClick={() => setShowInstruments(!showInstruments)}>
              {showInstruments ? "▾" : "▸"} Instruments
            </button>
            {showInstruments && (
              <div style={S.presetPanel}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={S.microLabel}>Note</label>
                  <select value={instNote} onChange={e => setInstNote(e.target.value)} style={S.selSm}>
                    {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <label style={S.microLabel}>Oct</label>
                  <select value={instOctave} onChange={e => setInstOctave(e.target.value)} style={S.selSm}>
                    {OCTAVES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <label style={S.microLabel}>Chord</label>
                  <select value={instChord} onChange={e => setInstChord(e.target.value)} style={S.selSm}>
                    <option value="">single note</option>
                    {CHORDS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {INSTRUMENT_PRESETS.map(inst => (
                    <button key={inst.label} style={S.presetBtn}
                      onClick={() => applyInstrument(inst.prompt)}>
                      {inst.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Duration with number input */}
            <SliderNum label="⏱ Duration" value={seconds} onChange={setSeconds}
              min={0.1} max={10} step={0.1} unit="sec" />

            {/* Seed */}
            <label style={S.label}>⚄ Seed</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="text" value={seed} onChange={e => setSeed(e.target.value.replace(/\D/g, ""))}
                placeholder="(random)" style={{ ...S.numInput, flex: 1 }} />
              <button onClick={randomSeed} style={S.iconBtn} title="Random seed">🎲</button>
            </div>
            <label style={S.checkLabel}>
              <input type="checkbox" checked={randomizeAfter} onChange={e => setRandomizeAfter(e.target.checked)} />
              Randomize seed after generating
            </label>

            {/* Advanced */}
            <button style={S.sectionToggle} onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? "▾" : "▸"} Advanced Parameters
            </button>
            {showAdvanced && (
              <div style={{ padding: "8px 0" }}>
                <SliderNum label="CFG Scale" value={cfgScale} onChange={setCfgScale}
                  min={1} max={15} step={0.5} />
                <div style={S.paramNote}>
                  Prompt adherence strength. <strong>3–5</strong> = loose, creative variations.
                  <strong> 7</strong> = balanced (default). <strong>10+</strong> = strict but can sound harsh or over-saturated.
                </div>
                <SliderNum label="Steps" value={steps} onChange={v => setSteps(Math.round(v))}
                  min={10} max={250} step={10} />
                <div style={S.paramNote}>
                  Diffusion iterations. <strong>50</strong> = fast preview, decent quality.
                  <strong> 100</strong> = good balance (default). <strong>150+</strong> = diminishing returns, mostly refines subtle texture.
                </div>
                <label style={S.labelSm}>Sampler</label>
                <select value={sampler} onChange={e => setSampler(e.target.value)} style={S.select}>
                  {SAMPLERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div style={S.paramNote}>
                  <strong>dpmpp-3m-sde</strong> = best overall (default). <strong>dpmpp-2m-sde</strong> = slightly different character.
                  <strong> k-dpm-2</strong> = sharper transients. <strong>k-heun</strong> = smooth, slower but stable.
                </div>
              </div>
            )}

            {/* AudioSR Super-Resolution */}
            {healthData?.audiosr_available && (
              <div style={S.audiosrBox}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ ...S.checkLabel, marginTop: 0, color: doAudioSR ? "#d4af55" : "#6a5a4a" }}>
                    <input type="checkbox" checked={doAudioSR} onChange={e => setDoAudioSR(e.target.checked)} />
                    ✦ AudioSR (48kHz upscale)
                  </label>
                </div>
                {doAudioSR && (
                  <div style={{ marginTop: 8 }}>
                    <SliderNum label="DDIM Steps" value={audiosrSteps}
                      onChange={v => setAudiosrSteps(Math.round(v))}
                      min={10} max={100} step={10} />
                    <div style={S.paramNote}>
                      How many denoising passes for the upscale. <strong>20</strong> = fast but rougher HF.
                      <strong> 50</strong> = sweet spot (default). <strong>100</strong> = marginally cleaner, 2× slower.
                    </div>
                    <SliderNum label="Guidance Scale" value={audiosrGuidance}
                      onChange={v => setAudiosrGuidance(Math.round(v * 10) / 10)}
                      min={1} max={10} step={0.5} />
                    <div style={S.paramNote}>
                      How aggressively AudioSR fills in high frequencies. <strong>2–3</strong> = subtle, natural.
                      <strong> 3.5</strong> = balanced (default). <strong>5–7</strong> = brighter, more HF energy but risks metallic artifacts.
                      <strong> 8+</strong> = aggressive, can sound unnatural on some sounds.
                    </div>
                    <div style={{ fontSize: 10, color: "#5a5248", fontStyle: "italic", fontFamily: MONO_FONT, marginTop: 4 }}>
                      Adds ~10-30s per clip. First run downloads the model (~2 GB).
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Generate Buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={handleGenerate}
                disabled={generating || !prompt.trim() || !!healthError}
                style={{ ...S.genBtn, opacity: generating || !prompt.trim() ? 0.5 : 1 }}>
                {generating ? "Forging…" : "☉ Forge Sound"}
              </button>
              <button onClick={handleBatch}
                disabled={generating || !prompt.trim() || !!healthError}
                style={{ ...S.batchBtn, opacity: generating || !prompt.trim() ? 0.5 : 1 }}>
                ×8 Batch
              </button>
            </div>

            {/* Progress */}
            {activeJobStates.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {activeJobStates.slice(0, 8).map(j => (
                  <div key={j.job_id} style={{ marginBottom: 4 }}>
                    <ProgressBar progress={j.progress} status={j.status} />
                  </div>
                ))}
                {activeJobStates.length > 8 && <div style={{ color: "#5a5248", fontSize: 11 }}>+{activeJobStates.length - 8} more…</div>}
              </div>
            )}
          </div>

          {/* ═══ Results Panel ═══ */}
          <div style={S.resultsPanel}>
            <h2 style={S.resultsTitle}>
              ✦ Conjured Sounds
              {completedJobs.length > 0 && <span style={S.clipCount}>{completedJobs.length}</span>}
            </h2>
            {completedJobs.length === 0 && !generating && (
              <div style={S.emptyState}>
                <span style={{ fontSize: 50, opacity: 0.15, color: "#d4af55" }}>☉</span>
                <p style={{ color: "#5a5248", fontFamily: SERIF_FONT, fontStyle: "italic" }}>
                  Enter an invocation and forge your sound.
                </p>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {completedJobs.map(j => <ClipCard key={j.job_id} job={j} />)}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MATRIX TAB */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {tab === "matrix" && (
        <div style={{ padding: "20px 28px", maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ fontSize: 13, color: "#8a7a5a", marginBottom: 16, lineHeight: 1.5, fontFamily: SERIF_FONT }}>
            Generate a grid varying <strong>steps</strong>, <strong>CFG</strong>, and <strong>sampler</strong> with
            a constant seed. All outputs are auto-saved with parameter info in the filename.
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
            {/* Left: prompt + seed */}
            <div style={{ flex: "1 1 300px", minWidth: 280 }}>
              <label style={S.label}>⌂ Invocation</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                rows={2} style={S.textarea} maxLength={500} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                <label style={S.checkLabel}>
                  <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} />
                  Enhance
                </label>
                <button style={S.linkBtn} onClick={() => setMatShowPrompt(!matShowPrompt)}>
                  {matShowPrompt ? "hide preview ▾" : "show what's sent →"}
                </button>
              </div>

              {/* Matrix prompt preview */}
              {matShowPrompt && (
                <div style={S.editorBox}>
                  <label style={S.microLabel}>POSITIVE (will be sent):</label>
                  <div style={{ fontSize: 12, color: "#c4b078", padding: "6px 0", fontFamily: MONO_FONT, lineHeight: 1.5 }}>
                    {enhance
                      ? (editedEnhanced ?? promptPreview?.enhanced ?? fullPrompt + ", high quality recording, clean")
                      : fullPrompt}
                  </div>
                  <label style={S.microLabel}>NEGATIVE:</label>
                  <div style={{ fontSize: 12, color: "#8b6030", padding: "6px 0", fontFamily: MONO_FONT, lineHeight: 1.5 }}>
                    {enhance
                      ? (editedNeg ?? promptPreview?.negative ?? "(default)")
                      : "(none — enhance off)"}
                  </div>
                  <div style={{ fontSize: 10, color: "#5a5248", marginTop: 4, fontStyle: "italic" }}>
                    Edit overrides on the Generate tab's prompt editor — they apply here too.
                  </div>
                </div>
              )}

              <label style={S.label}>⚄ Seed <span style={{ fontWeight: 400, color: "#8b3030", fontSize: 10 }}>(required)</span></label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="text" value={matSeed}
                  onChange={e => setMatSeed(e.target.value.replace(/\D/g, ""))}
                  placeholder="enter or randomize" style={{ ...S.numInput, flex: 1 }} />
                <button onClick={randomMatSeed} style={S.iconBtn}>🎲</button>
              </div>
              <SliderNum label="⏱ Duration" value={seconds} onChange={setSeconds}
                min={0.1} max={10} step={0.1} unit="sec" />
            </div>

            {/* Right: ranges */}
            <div style={{ flex: "1 1 340px", minWidth: 300 }}>
              <RangeInput label="Steps Range" value={matStepsRange} onChange={setMatStepsRange}
                step={1} minVal={10} maxVal={250} />
              <RangeInput label="CFG Range" value={matCfgRange} onChange={setMatCfgRange}
                step={0.5} minVal={1} maxVal={15} />
              <label style={S.labelSm}>Samplers</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {SAMPLERS.map(s => (
                  <label key={s} style={S.checkLabel}>
                    <input type="checkbox" checked={matSamplers.has(s)}
                      onChange={() => setMatSamplers(prev => {
                        const n = new Set(prev);
                        n.has(s) ? (n.size > 1 && n.delete(s)) : n.add(s);
                        return n;
                      })} />
                    {s}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#8a7a5a", marginBottom: 10, fontFamily: SERIF_FONT }}>
                {matComboCount} combinations
              </div>
              <button onClick={handleMatrixGenerate}
                disabled={matGenerating || !prompt.trim() || !matSeed || !!healthError}
                style={{ ...S.genBtn, opacity: matGenerating || !prompt.trim() || !matSeed ? 0.5 : 1, width: "100%" }}>
                {matGenerating ? `Forging ${matComboCount} combos…` : `▦ Forge Matrix (${matComboCount})`}
              </button>
            </div>
          </div>

          {/* Matrix Results */}
          {matResults && (
            <div>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                {matResults.samplers.length > 1 && matResults.samplers.map(s => (
                  <button key={s} onClick={() => { seqPlayer.stop(); setMatFilterSampler(s); }}
                    style={matFilterSampler === s ? S.tabActive : S.tabBtn}>
                    {s}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: "#5a5248", marginRight: 8, fontFamily: MONO_FONT }}>
                  seed: {matResults.seed}
                </span>
                {matrixWavUrls.length > 0 && (
                  <button onClick={seqPlayer.isPlaying ? seqPlayer.stop : seqPlayer.playAll}
                    style={S.playAllBtn}>
                    {seqPlayer.isPlaying
                      ? `⏹ Stop (${seqPlayer.playingIdx + 1}/${matrixWavUrls.length})`
                      : `▶ Play All (${matrixWavUrls.length})`}
                  </button>
                )}
              </div>
              {matrixGrid && (
                <div style={{ overflowX: "auto" }}>
                  <table style={S.matrixTable}>
                    <thead>
                      <tr>
                        <th style={S.matrixTh}>steps ↓ · cfg →</th>
                        {matrixGrid.cfgVals.map(cfg => (
                          <th key={cfg} style={S.matrixTh}>cfg {cfg}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixGrid.stepsVals.map((st, ri) => (
                        <tr key={st}>
                          <td style={S.matrixRowLabel}>{st} steps</td>
                          {matrixGrid.grid[ri].map((combo, ci) => (
                            <td key={ci} style={S.matrixCell}>
                              {combo ? <MatrixCell combo={combo} playingWavId={playingWavId} /> : <span style={{ color: "#3d3830" }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={S.footer}>
        ◆ Foley Studio · Plato's Sonic Cave · MMXXVI ◆
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Matrix Cell
// ═══════════════════════════════════════════════════════════════════════════════

function MatrixCell({ combo, playingWavId }: { combo: MatrixCombo & { job?: JobResponse }; playingWavId: string | null }) {
  const job = combo.job;
  const wUrl = job?.wav_id ? api.wavUrl(job.wav_id) : null;
  const isPlaying = playingWavId !== null && job?.wav_id === playingWavId;

  if (!job || job.status === "queued" || job.status === "running") {
    const pct = job ? Math.round(job.progress * 100) : 0;
    return (
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={S.progressOuter}>
          <div style={{ ...S.progressInner, width: `${pct}%`, backgroundColor: "#8a7a5a" }} />
        </div>
        <span style={{ fontSize: 10, color: "#5a5248" }}>{pct}%</span>
      </div>
    );
  }
  if (job.status === "error") return <span style={{ color: "#8b3030", fontSize: 10 }}>error</span>;

  return (
    <div style={isPlaying ? {
      outline: "2px solid #d4af55",
      outlineOffset: -2,
      borderRadius: 3,
      boxShadow: "0 0 12px rgba(212,175,85,0.5), inset 0 0 8px rgba(212,175,85,0.15)",
      transition: "all 0.15s",
    } : { transition: "all 0.15s" }}>
      {wUrl && <WaveformPlayer wavUrl={wUrl} height={36} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
        <span style={{ fontSize: 10, color: isPlaying ? "#d4af55" : "#6a5a4a" }}>
          {isPlaying && "▸ "}{job.meta?.duration_out.toFixed(2)}s
        </span>
        {wUrl && <a href={wUrl} download style={{ fontSize: 10, color: "#8a7a5a", textDecoration: "none" }}>↓</a>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES — Plato's Cave / 90s CD-ROM Stone Bevel
// ═══════════════════════════════════════════════════════════════════════════════

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1a1714 0%, #0f0d0b 100%)",
    color: "#c4b078",
    fontFamily: SERIF_FONT,
    margin: 0, padding: 0,
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 28px",
    background: STONE_BG,
    borderBottom: "3px solid #2a2520",
    boxShadow: `inset 0 -1px 0 rgba(180,160,120,0.1), 0 3px 10px rgba(0,0,0,0.6)`,
  },
  title: {
    fontSize: 20, fontWeight: 700, fontFamily: SERIF_FONT,
    color: "#d4af55", margin: 0, letterSpacing: 4,
    textShadow: "1px 1px 2px rgba(0,0,0,0.8), 0 0 15px rgba(212,175,85,0.3)",
  },
  subtitle: {
    fontSize: 9, letterSpacing: 3, color: "#8a7a5a", fontFamily: MONO_FONT, marginTop: 2,
  },
  badgeWarn: {
    background: "linear-gradient(145deg, #4a3a1a, #3a2a10)",
    color: "#d4af55", padding: "3px 10px", borderRadius: 2, fontSize: 11,
    fontFamily: MONO_FONT, fontWeight: 600, boxShadow: BEVEL_BTN,
    border: "1px solid #5a4a2a",
  },
  badgeOk: {
    background: "linear-gradient(145deg, #2a3a28, #1a2a18)",
    color: "#a0c070", padding: "3px 10px", borderRadius: 2, fontSize: 11,
    fontFamily: MONO_FONT, fontWeight: 600, boxShadow: BEVEL_BTN,
    border: "1px solid #3a4a2a",
  },
  autosaveBanner: {
    backgroundColor: "#14120f", borderBottom: "1px solid #2a2520",
    padding: "4px 28px", fontSize: 11, color: "#5a5248", fontFamily: MONO_FONT,
    fontStyle: "italic",
  },

  tabBar: {
    display: "flex", gap: 0,
    background: "linear-gradient(145deg, #3d3830, #2e2a24)",
    borderBottom: "2px solid #1a1714",
    padding: "0 28px",
    boxShadow: "inset 0 1px 0 rgba(180,160,120,0.08)",
  },
  tabBtn: {
    background: "none", border: "none",
    borderBottom: "3px solid transparent",
    color: "#6a5a4a", cursor: "pointer", padding: "12px 20px",
    fontSize: 15, fontFamily: SERIF_FONT, letterSpacing: 1,
    transition: "all 0.2s",
  },
  tabActive: {
    background: "none", border: "none",
    borderBottom: "3px solid #d4af55",
    color: "#d4af55", cursor: "pointer", padding: "12px 20px",
    fontSize: 15, fontFamily: SERIF_FONT, fontWeight: 600, letterSpacing: 1,
    textShadow: "0 0 10px rgba(212,175,85,0.4)",
  },

  layout: { display: "flex", gap: 0, padding: 0, minHeight: "calc(100vh - 160px)" },
  controlPanel: {
    width: 420, flexShrink: 0, padding: "20px 24px",
    borderRight: "3px solid #2a2520",
    background: "linear-gradient(180deg, #1e1b17 0%, #171410 100%)",
    overflowY: "auto" as const, maxHeight: "calc(100vh - 160px)",
    boxShadow: "inset -1px 0 0 rgba(180,160,120,0.05)",
  },
  resultsPanel: {
    flex: 1, padding: "20px 24px",
    background: "linear-gradient(180deg, #14120f 0%, #0f0d0b 100%)",
    overflowY: "auto" as const, maxHeight: "calc(100vh - 160px)",
  },

  label: {
    display: "block", fontSize: 15, fontWeight: 700, color: "#a09070",
    marginBottom: 4, marginTop: 14, fontFamily: SERIF_FONT, letterSpacing: 1,
  },
  labelSm: {
    display: "block", fontSize: 14, fontWeight: 600, color: "#7a6a5a",
    marginBottom: 4, fontFamily: SERIF_FONT,
  },
  microLabel: {
    fontSize: 12, color: "#5a5248", fontFamily: MONO_FONT, letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  checkLabel: {
    display: "flex", alignItems: "center", gap: 6, marginTop: 6,
    fontSize: 14, color: "#8a7a5a", cursor: "pointer", fontFamily: SERIF_FONT,
  },
  textarea: {
    width: "100%", boxSizing: "border-box" as const,
    backgroundColor: "#14120f", color: "#c4b078",
    border: "2px solid #3d3830", borderRadius: 3,
    padding: "10px 12px", fontSize: 15, fontFamily: SERIF_FONT,
    resize: "vertical" as const, outline: "none",
    boxShadow: STONE_INSET,
  },
  numInput: {
    backgroundColor: "#14120f", color: "#c4b078",
    border: "2px solid #3d3830", borderRadius: 2,
    padding: "6px 8px", fontSize: 13, fontFamily: MONO_FONT,
    outline: "none", boxShadow: STONE_INSET,
  },
  slider: { width: "100%", accentColor: "#d4af55" },
  select: {
    width: "100%", backgroundColor: "#14120f", color: "#c4b078",
    border: "2px solid #3d3830", borderRadius: 2,
    padding: "6px 8px", fontSize: 13, fontFamily: MONO_FONT,
    boxShadow: STONE_INSET,
  },
  selSm: {
    backgroundColor: "#14120f", color: "#c4b078",
    border: "1px solid #3d3830", borderRadius: 2,
    padding: "3px 6px", fontSize: 12, fontFamily: MONO_FONT,
  },
  iconBtn: {
    background: "linear-gradient(145deg, #4a4238, #3a3428)",
    border: "1px solid #5a5248", borderRadius: 3,
    padding: "5px 8px", cursor: "pointer", fontSize: 16,
    boxShadow: BEVEL_BTN,
  },

  tagGrid: { display: "flex", flexWrap: "wrap" as const, gap: 4 },
  tagBtn: {
    background: "linear-gradient(145deg, #2e2a24, #1e1b17)",
    border: "1px solid #3d3830", color: "#6a5a4a", borderRadius: 3,
    padding: "4px 10px", fontSize: 13, cursor: "pointer",
    fontFamily: SERIF_FONT, boxShadow: BEVEL_BTN,
    transition: "all 0.15s",
  },
  tagBtnActive: {
    background: "linear-gradient(145deg, #4a3a1a, #3a2a10)",
    border: "1px solid #7a6a2a", color: "#d4af55", borderRadius: 3,
    padding: "4px 10px", fontSize: 13, cursor: "pointer",
    fontFamily: SERIF_FONT, boxShadow: `${BEVEL_BTN}, ${GOLD_GLOW}`,
  },

  presetPanel: {
    background: "linear-gradient(145deg, #1e1b17, #14120f)",
    border: "2px solid #2a2520", borderRadius: 4, padding: 12, marginTop: 4,
    maxHeight: 280, overflowY: "auto" as const,
    boxShadow: STONE_INSET,
  },
  presetCat: {
    fontSize: 12, color: "#6a5a4a", letterSpacing: 1.5,
    textTransform: "uppercase" as const, marginBottom: 4, fontFamily: MONO_FONT,
  },
  presetBtn: {
    background: "linear-gradient(145deg, #2e2a24, #1e1b17)",
    border: "1px solid #3d3830", color: "#8a7a5a", borderRadius: 2,
    padding: "3px 8px", fontSize: 13, cursor: "pointer",
    fontFamily: SERIF_FONT, boxShadow: BEVEL_BTN,
  },

  sectionToggle: {
    background: "none", border: "none", color: "#6a5a4a", cursor: "pointer",
    fontSize: 15, padding: "10px 0 4px", fontFamily: SERIF_FONT, letterSpacing: 0.5,
    textAlign: "left" as const, width: "100%",
  },

  audiosrBox: {
    background: "linear-gradient(145deg, #14202a, #0f1a22)",
    border: "2px solid #1a3a4a", borderRadius: 4, padding: 12, marginTop: 12,
    boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.4), 0 0 6px rgba(85,191,212,0.1)",
  },

  paramNote: {
    fontSize: 12, color: "#6a5a4a", lineHeight: 1.6,
    fontFamily: SERIF_FONT, fontStyle: "italic",
    padding: "2px 0 8px", borderBottom: "1px solid #1e1b17", marginBottom: 8,
  },

  chaosBtn: {
    background: "linear-gradient(145deg, #2a1a14, #1a0a04)",
    border: "2px solid #5a2a1a", borderRadius: 4, padding: "4px 12px",
    color: "#ff6a3a", fontSize: 14, fontFamily: SERIF_FONT, fontWeight: 700,
    cursor: "pointer", letterSpacing: 0.5,
    boxShadow: "inset 0 1px 0 rgba(255,120,60,0.15), 1px 1px 4px rgba(0,0,0,0.4)",
    transition: "all 0.15s",
  },

  linkBtn: {
    background: "none", border: "none", color: "#8a7a5a", cursor: "pointer",
    fontSize: 13, textDecoration: "underline", fontFamily: MONO_FONT, padding: 0,
  },
  editorBox: {
    background: "linear-gradient(145deg, #1a1714, #14120f)",
    border: "2px solid #2a2520", borderRadius: 4, padding: 10, marginBottom: 4,
    boxShadow: STONE_INSET,
  },

  genBtn: {
    flex: 1,
    background: "linear-gradient(145deg, #5a4a1a, #3a3010, #4a3a1a)",
    color: "#d4af55",
    border: "2px solid #7a6a2a", borderRadius: 4,
    padding: "12px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer",
    fontFamily: SERIF_FONT, letterSpacing: 1,
    boxShadow: `${BEVEL_BTN}, ${GOLD_GLOW}`,
    textShadow: "0 0 8px rgba(212,175,85,0.4)",
  },
  batchBtn: {
    background: "linear-gradient(145deg, #3a3428, #2a2520)",
    color: "#8a7a5a",
    border: "2px solid #4a4238", borderRadius: 4,
    padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: SERIF_FONT, boxShadow: BEVEL_BTN,
  },
  smallBtn: {
    background: "linear-gradient(145deg, #2e2a24, #1e1b17)",
    border: "1px solid #3d3830", color: "#6a5a4a", borderRadius: 2,
    padding: "3px 8px", fontSize: 13, cursor: "pointer", textDecoration: "none",
    fontFamily: MONO_FONT, boxShadow: BEVEL_BTN,
  },

  playAllBtn: {
    background: "linear-gradient(145deg, #4a3a1a, #3a2a10)",
    border: "1px solid #7a6a2a", color: "#d4af55", borderRadius: 3,
    padding: "6px 14px", fontSize: 14, cursor: "pointer",
    fontFamily: SERIF_FONT, fontWeight: 600,
    boxShadow: `${BEVEL_BTN}, ${GOLD_GLOW}`,
  },

  resultsTitle: {
    fontSize: 16, fontWeight: 700, color: "#a09070",
    fontFamily: SERIF_FONT, letterSpacing: 2, marginBottom: 16, marginTop: 0,
    textShadow: "0 0 6px rgba(212,175,85,0.2)",
  },
  clipCount: {
    background: "linear-gradient(145deg, #4a3a1a, #3a2a10)",
    color: "#d4af55", padding: "2px 10px", borderRadius: 10, fontSize: 11,
    marginLeft: 8, fontWeight: 700, boxShadow: BEVEL_BTN,
  },
  emptyState: { textAlign: "center" as const, padding: "60px 20px" },

  clipCard: {
    background: STONE_BG,
    border: "2px solid #3d3830", borderRadius: 6, padding: 14,
    boxShadow: STONE_RAISED,
  },
  tag: {
    background: "linear-gradient(145deg, #2e2a24, #1e1b17)",
    border: "1px solid #3d3830", color: "#7a6a5a", borderRadius: 2,
    padding: "2px 6px", fontSize: 10, fontFamily: MONO_FONT,
  },
  metaBlock: {
    marginTop: 8, padding: 10, backgroundColor: "#14120f",
    borderRadius: 3, fontSize: 11, color: "#6a5a4a", lineHeight: 1.6,
    fontFamily: MONO_FONT, wordBreak: "break-all" as const,
    boxShadow: STONE_INSET,
  },

  progressOuter: {
    position: "relative" as const, height: 6,
    backgroundColor: "#1e1b17", borderRadius: 3, overflow: "hidden" as const,
    boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.5)",
  },
  progressInner: {
    position: "absolute" as const, top: 0, left: 0, height: "100%",
    borderRadius: 3, transition: "width 0.3s",
  },
  progressText: {
    position: "absolute" as const, right: 4, top: -1, fontSize: 8, color: "#5a5248",
  },

  matrixTable: {
    borderCollapse: "collapse" as const, width: "100%", fontFamily: MONO_FONT,
  },
  matrixTh: {
    padding: "8px 6px", fontSize: 10, color: "#a09070",
    textAlign: "center" as const, borderBottom: "2px solid #2a2520",
    fontWeight: 700, whiteSpace: "nowrap" as const,
    fontFamily: SERIF_FONT, letterSpacing: 0.5,
  },
  matrixRowLabel: {
    padding: "8px 10px 8px 0", fontSize: 10, color: "#a09070",
    textAlign: "right" as const, borderRight: "2px solid #2a2520",
    fontWeight: 700, whiteSpace: "nowrap" as const, verticalAlign: "top" as const,
    fontFamily: SERIF_FONT,
  },
  matrixCell: {
    padding: 6, borderBottom: "1px solid #1e1b17",
    borderRight: "1px solid #1e1b17", verticalAlign: "top" as const, minWidth: 140,
  },

  footer: {
    textAlign: "center" as const, padding: "12px 20px",
    fontSize: 10, color: "#3d3830", fontFamily: SERIF_FONT, letterSpacing: 2,
    borderTop: "2px solid #2a2520",
    background: "linear-gradient(145deg, #1a1714, #0f0d0b)",
  },
};
