/** Shared AI types safe for client + server imports (no OpenAI SDK). */

export type AiVerdict =
  | "strong_fit"
  | "possible"
  | "weak_fit"
  | "not_recommended";

/** Compact AI strip for JobCard / Smart Match list */
export interface JobAiStrip {
  jobId: string;
  fitScore: number;
  verdict: AiVerdict;
  /** One-line blurb for card strip */
  blurb: string;
  rank?: number;
  ruleMatchScore?: number;
  provider: "xai" | "heuristic";
}

export interface JobAiAdvice {
  headline: string;
  summary: string;
  fitScore: number;
  verdict: AiVerdict;
  pros: string[];
  cons: string[];
  payTake: string;
  workforceTake: string;
  skillsAligned: string[];
  skillsGap: string[];
  actionTips: string[];
  ruleMatchScore?: number;
  model?: string;
  provider: "xai" | "heuristic";
  generatedAt: string;
}

export interface BatchRankResult {
  ranked: JobAiStrip[];
  overview: string;
  provider: "xai" | "heuristic";
  model?: string;
  generatedAt: string;
  topN: number;
}

/** LLM-primary match score for Smart Match */
export interface LlmMatchScore {
  jobId: string;
  fitScore: number;
  verdict: AiVerdict;
  reasons: string[];
  blurb: string;
  ruleMatchScore?: number;
  provider: "xai" | "heuristic";
  rank?: number;
}
