import type { SummaryResult } from "../types";
import OpenAI from "openai";
import { encodingForModel, type TiktokenModel } from "js-tiktoken";

// --- Configuration & Constants ---

interface ModelSpec {
  id: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStrict: boolean;
  costPer1MInput: number;
  costPer1MOutput: number;
}

// Updated based on your provided docs
const MODEL_SPECS: Record<string, ModelSpec> = {
  // The star of the show
  "gpt-4.1-nano": { 
    id: "gpt-4.1-nano", 
    contextWindow: 1_047_576, // ~1M Tokens
    maxOutputTokens: 32_768, 
    supportsStrict: true,
    costPer1MInput: 0.10,
    costPer1MOutput: 0.40
  },
  // Specific snapshot version
  "gpt-4.1-nano-2025-04-14": { 
    id: "gpt-4.1-nano-2025-04-14", 
    contextWindow: 1_047_576, 
    maxOutputTokens: 32_768, 
    supportsStrict: true,
    costPer1MInput: 0.10,
    costPer1MOutput: 0.40
  },
  // Fallbacks
  "gpt-4o-mini": { 
    id: "gpt-4o-mini", 
    contextWindow: 128_000, 
    maxOutputTokens: 16_384, 
    supportsStrict: true,
    costPer1MInput: 0.15,
    costPer1MOutput: 0.60
  }
};

// --- Strict Schemas ---

const SUMMARY_SCHEMA = {
  name: "article_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { 
        type: "string", 
        description: "A concise professional summary of the article." 
      },
      key_points: { 
        type: "array", 
        description: "List of extracted key facts.",
        items: { type: "string" } 
      },
      tags: { 
        type: "array", 
        description: "SEO-friendly tags.",
        items: { type: "string" } 
      },
      sentiment: { 
        type: "string", 
        description: "Overall sentiment analysis.",
        enum: ["Positive", "Neutral", "Negative"] 
      },
      podcast_script: {
        type: ["string", "null"],
        description: "A conversational, engaging solo podcast script based on the article, under 5 minutes."
      }
    },
    required: ["summary", "key_points", "tags", "sentiment", "podcast_script"],
    additionalProperties: false
  }
};



export class ArticleAnalystAgent {
  private openai: OpenAI;
  private env: Env;
  private modelSpec: ModelSpec;

  constructor(env: Env) {
    this.env = env;
    const apiKey = (env as any).OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: (env as any).OPENAI_BASE_URL || "https://api.openai.com/v1"
    });

    // Smart Resolution:
    // 1. Check env var AI_MODEL_NAME
    // 2. Default to "gpt-4.1-nano"
    const rawName = (env as any).AI_MODEL_NAME || "gpt-4.1-nano";
    this.modelSpec = this.resolveModel(rawName);
    
    console.log(`[Agent] Initialized ${this.modelSpec.id}`);
    console.log(`[Agent] Context: ${this.modelSpec.contextWindow.toLocaleString()} tokens | Output Max: ${this.modelSpec.maxOutputTokens.toLocaleString()}`);
  }

  /**
   * Main entry point.
   * With 1M context, this will almost NEVER need to chunk, making it incredibly fast.
   */
  async summarize(text: string): Promise<SummaryResult> {
    const tokenCount = this.countTokens(text);
    
    // Safety margin: Reserve space for system prompt + expected output
    const OUTPUT_TOKEN_BUFFER = 2000; // Buffer for system prompt and potential overhead
    const reservedTokens = this.modelSpec.maxOutputTokens + OUTPUT_TOKEN_BUFFER;
    const effectiveLimit = this.modelSpec.contextWindow - reservedTokens;

    console.log(`[Agent] Input Tokens: ${tokenCount.toLocaleString()} / Limit: ${effectiveLimit.toLocaleString()}`);

    if (tokenCount <= effectiveLimit) {
      return this.generateFinalSummary(text);
    }

    // Fallback for truly massive datasets (e.g. whole books)
    console.warn(`[Agent] Input exceeds 1M context! Engaging Map-Reduce Chunking.`);
    return this.mapReduceSummarize(text, effectiveLimit);
  }

  /**
   * Standard single-pass generation (Used 99% of the time).
   */
  private async generateFinalSummary(text: string, isConsolidated = false): Promise<SummaryResult> {
    const systemPrompt = isConsolidated
      ? "You are an expert editor and podcast producer. Consolidate these partial summaries into one cohesive, structured report and a final unified podcast script."
      : "You are an expert content analyst and podcast producer. Analyze the article and return a structured summary, key points, tags, sentiment, and a conversational podcast script.";

    const completion = await this.openai.chat.completions.create({
      model: this.modelSpec.id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      // Explicit support for structured outputs (per docs)
      response_format: { 
        type: "json_schema", 
        json_schema: SUMMARY_SCHEMA 
      },
      max_tokens: this.modelSpec.maxOutputTokens
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    return JSON.parse(content) as SummaryResult;
  }

  /**
   * Map-Reduce: Only used if input > 1,000,000 tokens.
   */
  private async mapReduceSummarize(text: string, maxTokensPerChunk: number): Promise<SummaryResult> {
    const chunks = this.chunkText(text, maxTokensPerChunk);
    
    // Parallelize chunk processing (Map)
    // Note: With massive 1M chunks, be mindful of timeout limits on Cloudflare Workers (usually 30s CPU / longer wall time).
    const chunkSummaries = await Promise.all(
      chunks.map((chunk) => this.summarizeChunk(chunk))
    );

    const combinedText = chunkSummaries.join("\n\n---\n\n");
    return this.generateFinalSummary(combinedText, true);
  }

  private async summarizeChunk(chunk: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: this.modelSpec.id,
      messages: [
        { role: "system", content: "Summarize this section. Capture key facts." },
        { role: "user", content: chunk }
      ],
      max_tokens: 4000 // Limit intermediate summaries
    });
    return response.choices[0].message.content || "";
  }

  // --- Utilities ---

  private resolveModel(name: string): ModelSpec {
    const n = name.toLowerCase().trim();
    if (MODEL_SPECS[n]) return MODEL_SPECS[n];

    // Fuzzy matching for "nano"
    if (n.includes("nano")) {
      // Check if they want the snapshot or base
      if (n.includes("2025-04-14")) return MODEL_SPECS["gpt-4.1-nano-2025-04-14"];
      return MODEL_SPECS["gpt-4.1-nano"];
    }

    return MODEL_SPECS["gpt-4o-mini"]; // Safe default
  }

  private countTokens(text: string): number {
    try {
      // 'o200k_base' is standard for GPT-4o family. 
      // Assuming 4.1 uses compatible tokenizer.
      const enc = encodingForModel("gpt-4o" as TiktokenModel);
      return enc.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }

  private chunkText(text: string, maxTokens: number): string[] {
    const enc = encodingForModel("gpt-4o" as TiktokenModel);
    const tokens = enc.encode(text);
    const chunks: string[] = [];

    for (let i = 0; i < tokens.length; i += maxTokens) {
      const slice = tokens.slice(i, i + maxTokens);
      chunks.push(enc.decode(slice));
    }
    return chunks;
  }
}