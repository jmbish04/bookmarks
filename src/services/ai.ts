import type { Env, PodcastScriptResult, SummaryResult, VectorChunk } from "../types";

const SUMMARY_MODEL = "@cf/meta/llama-3-8b-instruct";
const SCRIPT_MODEL = "@cf/meta/llama-3-8b-instruct";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const TTS_MODEL = "@cf/deepgram/aura-1";

/**
 * Generate a structured summary JSON response for the provided text.
 */
export async function generateSummary(env: Env, text: string): Promise<SummaryResult> {
  const response = await env.AI.run(SUMMARY_MODEL, {
    prompt: `Summarize the following article into JSON with keys summary and key_points (array):\n\n${text}`
  });

  const parsed = typeof response === "string" ? JSON.parse(response) : response;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "summary" in parsed &&
    "key_points" in parsed &&
    typeof (parsed as { summary: unknown }).summary === "string" &&
    Array.isArray((parsed as { key_points: unknown }).key_points)
  ) {
    return parsed as SummaryResult;
  }

  throw new Error("Invalid summary response format");
}

/**
 * Generate a conversational podcast script for the article text.
 */
export async function generatePodcastScript(env: Env, text: string): Promise<PodcastScriptResult> {
  const response = await env.AI.run(SCRIPT_MODEL, {
    prompt: `Rewrite the article into a conversational podcast script. Return JSON with key script.\n\n${text}`
  });

  const parsed = typeof response === "string" ? JSON.parse(response) : response;
  if (typeof parsed === "object" && parsed !== null && "script" in parsed && typeof (parsed as { script: unknown }).script === "string") {
    return parsed as PodcastScriptResult;
  }

  throw new Error("Invalid podcast script response format");
}

/**
 * Generate embeddings for each chunk of text with Workers AI.
 */
export async function generateEmbeddings(env: Env, chunks: string[]): Promise<number[][]> {
  const response = await env.AI.run(EMBEDDING_MODEL, { text: chunks });
  if (Array.isArray(response)) {
    return response as number[][];
  }
  return (response as { data: number[][] }).data;
}

/**
 * Upsert vector embeddings into the Vectorize index.
 */
export async function upsertVectors(env: Env, vectors: VectorChunk[]): Promise<void> {
  await env.VECTORIZE.upsert(vectors);
}

/**
 * Synthesize an MP3 audio buffer from a podcast script.
 */
export async function synthesizeAudio(env: Env, script: string): Promise<ArrayBuffer> {
  const response: unknown = await env.AI.run(TTS_MODEL, {
    text: script,
    format: "mp3"
  });

  if (response instanceof ArrayBuffer) {
    return response;
  }

  if (response instanceof Uint8Array) {
    const slice = response.buffer.slice(response.byteOffset, response.byteOffset + response.byteLength);
    return slice as ArrayBuffer;
  }

  throw new Error("Unexpected TTS response type");
}
