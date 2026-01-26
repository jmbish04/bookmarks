import type { Env, PodcastScriptResult, SummaryResult, VectorChunk } from "../types";

const SUMMARY_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SCRIPT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const TTS_MODEL = "@cf/deepgram/aura-1";

const parseJsonResponse = <T>(response: unknown): T => {
  if (typeof response === "string") {
    try {
      return JSON.parse(response) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown JSON parse error";
      throw new Error(`Failed to parse JSON response: ${message}`);
    }
  }
  if (!response || typeof response !== "object") {
    throw new Error("Invalid JSON response");
  }
  return response as T;
};

const isSummaryResult = (value: unknown): value is SummaryResult =>
  typeof value === "object" &&
  value !== null &&
  "summary" in value &&
  "key_points" in value &&
  typeof (value as { summary: unknown }).summary === "string" &&
  Array.isArray((value as { key_points: unknown }).key_points);

const isPodcastScriptResult = (value: unknown): value is PodcastScriptResult =>
  typeof value === "object" && value !== null && "script" in value && typeof (value as { script: unknown }).script === "string";

/**
 * Generate a structured summary JSON response for the provided text.
 */
export async function generateSummary(env: Env, text: string): Promise<SummaryResult> {
  const response = await env.AI.run(SUMMARY_MODEL, {
    messages: [
      { role: "system", content: "Return JSON that matches the provided schema." },
      {
        role: "user",
        content: `Summarize the following article.\n\n${text}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_points: { type: "array", items: { type: "string" } }
        },
        required: ["summary", "key_points"]
      }
    }
  });

  try {
    const parsed = parseJsonResponse<SummaryResult>(response);
    if (isSummaryResult(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error("Failed to parse summary response", error, response);
    throw new Error("Summary response parsing failed");
  }

  throw new Error("Summary response validation failed");
}

/**
 * Generate a conversational podcast script for the article text.
 */
export async function generatePodcastScript(env: Env, text: string): Promise<PodcastScriptResult> {
  const response = await env.AI.run(SCRIPT_MODEL, {
    messages: [
      { role: "system", content: "Return JSON that matches the provided schema." },
      {
        role: "user",
        content: `Rewrite the article into a conversational podcast script.\n\n${text}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          script: { type: "string" }
        },
        required: ["script"]
      }
    }
  });

  try {
    const parsed = parseJsonResponse<PodcastScriptResult>(response);
    if (isPodcastScriptResult(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error("Failed to parse podcast script response", error, response);
    throw new Error("Podcast script response parsing failed");
  }

  throw new Error("Podcast script response validation failed");
}

/**
 * Generate embeddings for each chunk of text with Workers AI.
 */
export async function generateEmbeddings(env: Env, chunks: string[]): Promise<number[][]> {
  const response = await env.AI.run(EMBEDDING_MODEL, { text: chunks });
  if (Array.isArray(response)) {
    return response as number[][];
  }
  if (response && typeof response === "object" && "data" in response && Array.isArray(response.data)) {
    return response.data as number[][];
  }
  throw new Error("Unexpected embedding response format");
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
