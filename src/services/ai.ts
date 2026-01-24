import type { PodcastScriptResult, SummaryResult, VectorChunk } from "../types";

const SUMMARY_MODEL = "@cf/meta/llama-3-8b-instruct";
const SCRIPT_MODEL = "@cf/meta/llama-3-8b-instruct";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const TTS_MODEL = "@cf/deepgram/aura-1";

export async function generateSummary(ai: Ai, text: string): Promise<SummaryResult> {
  const response = await ai.run(SUMMARY_MODEL, {
    prompt: `Summarize the following article into JSON with keys summary and key_points (array):\n\n${text}`
  });

  if (typeof response !== "string") {
    return response as SummaryResult;
  }

  return JSON.parse(response) as SummaryResult;
}

export async function generatePodcastScript(ai: Ai, text: string): Promise<PodcastScriptResult> {
  const response = await ai.run(SCRIPT_MODEL, {
    prompt: `Rewrite the article into a conversational podcast script. Return JSON with key script.\n\n${text}`
  });

  if (typeof response !== "string") {
    return response as PodcastScriptResult;
  }

  return JSON.parse(response) as PodcastScriptResult;
}

export async function generateEmbeddings(ai: Ai, chunks: string[]): Promise<number[][]> {
  const response = await ai.run(EMBEDDING_MODEL, { text: chunks });
  if (Array.isArray(response)) {
    return response as number[][];
  }
  return (response as { data: number[][] }).data;
}

export async function upsertVectors(index: VectorizeIndex, vectors: VectorChunk[]): Promise<void> {
  await index.upsert(vectors);
}

export async function synthesizeAudio(ai: Ai, script: string): Promise<ArrayBuffer> {
  const response: unknown = await ai.run(TTS_MODEL, {
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
