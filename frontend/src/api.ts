import type {
  JobResponse, BatchResponse, HealthResponse,
  GenerateParams, MatrixParams, MatrixResponse, PromptPreview,
} from "./types";

const BASE = "/api";

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const health = () => request<HealthResponse>("/health");

export const previewPrompt = (prompt: string, enhance: boolean,
  enhancedOverride?: string | null, negOverride?: string | null) =>
  request<PromptPreview>("/preview_prompt", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt, enhance, seconds: 2, steps: 100, cfg_scale: 7, sampler: "dpmpp-3m-sde",
      enhanced_prompt_override: enhancedOverride || null,
      negative_prompt_override: negOverride || null,
    }),
  });

export const generateOneShot = (p: GenerateParams) =>
  request<JobResponse>("/generate_one_shot", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });

export const generateBatch = (p: GenerateParams, count: number) =>
  request<BatchResponse>("/generate_batch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p, count }),
  });

export const generateMatrix = (p: MatrixParams) =>
  request<MatrixResponse>("/generate_matrix", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });

export const pollJob = (id: string) => request<JobResponse>(`/job/${id}`);
export const wavUrl = (id: string) => `${BASE}/wav/${id}`;
export const chaosPrompt = (base: string = "") =>
  request<{ chaos_prompt: string }>(`/chaos_prompt?base=${encodeURIComponent(base)}`);
