CREATE TABLE IF NOT EXISTS snapshots (
  code_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_expiry ON snapshots(expires_at);
CREATE TABLE IF NOT EXISTS snapshot_chunks (
  code_hash TEXT NOT NULL REFERENCES snapshots(code_hash) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (code_hash, part)
);
CREATE TABLE IF NOT EXISTS storage_usage (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bytes INTEGER NOT NULL DEFAULT 0 CHECK (bytes >= 0)
);
INSERT OR IGNORE INTO storage_usage(id,bytes) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS snapshot_add AFTER INSERT ON snapshots BEGIN
  UPDATE storage_usage SET bytes = bytes + NEW.byte_size WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS snapshot_remove AFTER DELETE ON snapshots BEGIN
  UPDATE storage_usage SET bytes = bytes - OLD.byte_size WHERE id=1;
END;
CREATE TABLE IF NOT EXISTS daily_budget (
  day TEXT PRIMARY KEY,
  reads INTEGER NOT NULL,
  writes INTEGER NOT NULL,
  saves INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vote_cache (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS vote_cache_age ON vote_cache(fetched_at);
