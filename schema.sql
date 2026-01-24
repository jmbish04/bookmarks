CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  last_synced_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY,
  raindrop_id INTEGER UNIQUE NOT NULL,
  title TEXT,
  url TEXT NOT NULL,
  byline TEXT,
  summary TEXT,
  text_content TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raindrop_id INTEGER UNIQUE NOT NULL,
  html_kv_key TEXT NOT NULL,
  extracted_at TEXT DEFAULT (datetime('now')),
  error TEXT
);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raindrop_id INTEGER UNIQUE NOT NULL,
  audio_key TEXT NOT NULL,
  script TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
