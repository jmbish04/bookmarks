// Env is now defined in worker-configuration.d.ts

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
  cover_image: string | null;
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
  excerpt?: string;
  type?: string;
  cover?: string;
  domain?: string;
  tags?: string[];
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
  tags: string[];
  sentiment: "Positive" | "Neutral" | "Negative";
  podcast_script?: string;
}

export interface PodcastScriptResult {
  script: string;
}

export interface VectorChunk {
  id: string;
  values: number[];
  metadata: Record<string, string | number>;
}

export interface RaindropTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}
