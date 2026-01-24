export interface Env {
  DB: D1Database;
  HTML_CACHE: KVNamespace;
  PODCAST_BUCKET: R2Bucket;
  BOOKMARK_QUEUE: Queue<BookmarkQueueMessage>;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  BROWSER: Fetcher;
  RAINDROP_TOKEN: string;
  APP_URL: string;
  PODCAST_BASE_URL: string;
}

export interface SyncLog {
  id: number;
  last_synced_at: string;
  created_at: string;
}

export interface BookmarkRecord {
  id: number;
  raindrop_id: number;
  title: string | null;
  url: string;
  byline: string | null;
  summary: string | null;
  text_content: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ContentCacheRecord {
  id: number;
  raindrop_id: number;
  html_kv_key: string;
  extracted_at: string | null;
  error: string | null;
}

export interface PodcastEpisodeRecord {
  id: number;
  raindrop_id: number;
  audio_key: string;
  script: string | null;
  created_at: string | null;
}

export interface RaindropItem {
  _id: number;
  title: string;
  link: string;
  created: string;
}

export interface RaindropResponse {
  items: RaindropItem[];
  count: number;
}

export interface BookmarkQueueMessage {
  raindropId: number;
  link: string;
  title?: string;
  created: string;
}

export interface ExtractedContent {
  title: string;
  byline: string | null;
  textContent: string;
  html: string;
}

export interface SummaryResult {
  summary: string;
  key_points: string[];
}

export interface PodcastScriptResult {
  script: string;
}

export interface VectorChunk {
  id: string;
  values: number[];
  metadata: Record<string, string | number>;
}
