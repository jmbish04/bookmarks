import type { PodcastScriptResult, SummaryResult, VectorChunk } from "../types";

// UPDATED: Using Mistral Small 24B for its massive 128k context window and strong reasoning.
// This allows processing full articles in one pass without losing context via chunking.
const TEXT_GENERATION_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct" as any;

const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5" as any;
const TTS_MODEL = "@cf/deepgram/aura-1" as any;

// Expanded safe limit to ~100k characters (approx 25k-30k tokens), 
// well within the model's 128k limit, removing the need for recursive chunking.
const MAX_INPUT_LENGTH = 100000; 

const parseJsonResponse = <T>(response: unknown): T => {
  if (typeof response === "string") {
    try {
      // Clean up markdown code blocks if the model adds them (common with robust models)
      const cleaned = response.replace(/^```json\s*|\s*```$/g, "");
      return JSON.parse(cleaned) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown JSON parse error";
      throw new Error(`Failed to parse JSON response: ${message} | Raw: ${response}`);
    }
  }
  if (!response || typeof response !== "object") {
    throw new Error("Invalid JSON response");
  }
  return response as T;
};

// UPDATED: Type guard now checks for 'tags' and 'sentiment'
const isSummaryResult = (value: unknown): value is SummaryResult =>
  typeof value === "object" &&
  value !== null &&
  "summary" in value &&
  "key_points" in value &&
  "tags" in value && 
  Array.isArray((value as { key_points: unknown }).key_points) &&
  Array.isArray((value as { tags: unknown }).tags);

const isPodcastScriptResult = (value: unknown): value is PodcastScriptResult =>
  typeof value === "object" && 
  value !== null && 
  "script" in value && 
  typeof (value as { script: unknown }).script === "string";

/**
 * Generate a structured summary JSON response including tags and sentiment.
 * Utilizes high-context window to process articles in a single pass.
 */
export async function generateSummary(env: Env, text: string): Promise<SummaryResult> {
  // 1. Safety check for purely massive files, but largely unnecessary now.
  if (text.length > MAX_INPUT_LENGTH) {
    console.warn(`[AI] Input length ${text.length} exceeds safety limit. Truncating to ${MAX_INPUT_LENGTH}.`);
    text = text.slice(0, MAX_INPUT_LENGTH);
  }

  const response = await env.AI.run(TEXT_GENERATION_MODEL, {
    messages: [
      { 
        role: "system", 
        content: `You are an expert content analyst. Analyze the provided article and return a structured JSON response.
        - Create a concise professional summary.
        - Extract key takeaways.
        - Generate relevant SEO-friendly tags/categories.
        - Determine the overall sentiment (Positive, Neutral, Negative).` 
      },
      {
        role: "user",
        content: `Article Content:\n\n${text}`
      }
    ],
    // Schema constraint ensures consistent structured output
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative"] }
        },
        required: ["summary", "key_points", "tags", "sentiment"]
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

  throw new Error("Summary response validation failed - Missing required fields (tags/key_points)");
}

/**
 * Generate a conversational podcast script for the article text.
 * Instructions tuned for an engaging, audio-first experience.
 */
export async function generatePodcastScript(env: Env, text: string): Promise<PodcastScriptResult> {
  // Truncate for script generation if necessary, though 128k context handles most fits.
  const processedText = text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text;

  const response = await env.AI.run(TEXT_GENERATION_MODEL, {
    messages: [
      { 
        role: "system", 
        content: `You are a podcast producer. Convert the provided article into an engaging, conversational solo podcast script.
        - Use a friendly, knowledgeable tone.
        - Avoid reading the text verbatim; adapt it for listening.
        - Include natural transitions (e.g., "Now, let's look at...", "Here's the interesting part...").
        - Keep it under 5 minutes of speaking time.` 
      },
      {
        role: "user",
        content: `Source Article:\n\n${processedText}`
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
 * Generate embeddings for text chunks using Workers AI.
 * Useful for RAG (Retrieval-Augmented Generation) downstream.
 */
export async function generateEmbeddings(env: Env, chunks: string[]): Promise<number[][]> {
  // Ensure we don't send empty chunks
  const validChunks = chunks.filter(c => c && c.length > 0);
  if (validChunks.length === 0) return [];

  const response = await env.AI.run(EMBEDDING_MODEL, { text: validChunks });
  
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
  if (vectors.length === 0) return;
  await env.VECTORIZE.upsert(vectors);
}

/**
 * Synthesize an MP3 audio buffer from a podcast script.
 */
export async function synthesizeAudio(env: Env, script: string): Promise<ArrayBuffer> {
  // Aura-1 has a char limit per request (often ~2000-3000 chars). 
  // If scripts are long, this might need a simple split/merge logic.
  // For now, we assume the script fits or the model handles basic lengths.
  
  const response: unknown = await env.AI.run(TTS_MODEL, {
    text: script
  });

  // 1. Handle Response object (standard Workers AI return)
  if (response && typeof (response as any).arrayBuffer === 'function') {
      return await (response as any).arrayBuffer();
  }

  // 2. Handle ReadableStream (direct stream return)
  if (response instanceof ReadableStream || ((response as any).getReader && typeof (response as any).getReader === 'function')) {
      const r = new Response(response as any);
      return await r.arrayBuffer();
  }

  // 3. Handle direct ArrayBuffer
  if (response instanceof ArrayBuffer) {
    return response;
  }

  // 4. Handle Uint8Array
  if (response instanceof Uint8Array) {
    const slice = response.buffer.slice(response.byteOffset, response.byteOffset + response.byteLength);
    return slice as ArrayBuffer;
  }

  console.warn("Unexpected TTS response:", response);
  throw new Error(`Unexpected TTS response type: ${typeof response}`);
}