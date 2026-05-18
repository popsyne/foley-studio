export interface ClipMeta {
  seed: number;
  raw_prompt: string;
  enhanced_prompt: string;
  negative_prompt: string;
  model_id: string;
  duration_in: number;
  duration_out: number;
  peak_dbfs: number;
  rms_db: number;
  onset_time_estimate: number;
  sample_rate: number;
  cfg_scale: number;
  steps: number;
  sampler: string;
  saved_path: string;
  audiosr_applied: boolean;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  wav_id: string | null;
  meta: ClipMeta | null;
  is_mock: boolean;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface BatchResponse { job_ids: string[]; }

export interface HealthResponse {
  status: string;
  mock_mode: boolean;
  model_id: string;
  gpu_available: boolean;
  sample_rate: number;
  autosave_dir: string;
  audiosr_available: boolean;
  audiosr_loaded: boolean;
}

export interface GenerateParams {
  prompt: string;
  seconds: number;
  seed: number | null;
  cfg_scale: number;
  steps: number;
  sampler: string;
  enhance: boolean;
  enhanced_prompt_override: string | null;
  negative_prompt_override: string | null;
  audiosr: boolean;
  audiosr_steps: number;
  audiosr_guidance: number;
}

export interface RangeSpec { min: number; max: number; step: number; }

export interface MatrixParams {
  prompt: string;
  seconds: number;
  seed: number;
  enhance: boolean;
  enhanced_prompt_override: string | null;
  negative_prompt_override: string | null;
  steps_range: RangeSpec | null;
  cfg_range: RangeSpec | null;
  samplers: string[] | null;
  audiosr: boolean;
  audiosr_steps: number;
  audiosr_guidance: number;
}

export interface MatrixCombo {
  job_id: string;
  steps: number;
  cfg_scale: number;
  sampler: string;
}

export interface MatrixResponse {
  matrix_id: string;
  job_ids: string[];
  combos: MatrixCombo[];
  seed: number;
  prompt: string;
}

export interface PromptPreview {
  raw: string;
  enhanced: string;
  negative: string;
}
