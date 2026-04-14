import Database from "better-sqlite3";
import type { SyncCursor } from "../types/fetch.js";

export class CursorRepo {
  constructor(private readonly db: Database.Database) {}

  get(sourceId: string): SyncCursor | null {
    const row = this.db.prepare(`
      SELECT cursor_json
      FROM sync_cursors
      WHERE source_id = ?
    `).get(sourceId) as { cursor_json: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.cursor_json) as SyncCursor;
  }

  put(sourceId: string, cursor: SyncCursor): void {
    this.db.prepare(`
      INSERT INTO sync_cursors (source_id, cursor_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        cursor_json = excluded.cursor_json,
        updated_at = excluded.updated_at
    `).run(sourceId, JSON.stringify(cursor), new Date().toISOString());
  }
}
