import Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_records (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_app TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      range_start TEXT NOT NULL,
      range_end TEXT NOT NULL,
      source_key TEXT NOT NULL,
      cwd TEXT,
      title TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      raw_record_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_app TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      cwd TEXT,
      project_hint TEXT,
      title TEXT,
      content TEXT NOT NULL,
      content_redacted TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_cursors (
      source_id TEXT PRIMARY KEY,
      cursor_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at);
    CREATE INDEX IF NOT EXISTS idx_events_source_type ON events (source_type);
    CREATE INDEX IF NOT EXISTS idx_events_source_app ON events (source_app);
    CREATE INDEX IF NOT EXISTS idx_raw_records_occurred_at ON raw_records (occurred_at);
  `);
}
