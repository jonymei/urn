import Database from "better-sqlite3";
import type { RawRecord } from "../types/raw-record.js";

export class RawRecordRepo {
  constructor(private readonly db: Database.Database) {}

  insertMany(records: RawRecord[]): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO raw_records (
        id, node_id, source_type, source_app, occurred_at, fetched_at,
        range_start, range_end, source_key, cwd, title, payload_json
      ) VALUES (
        @id, @nodeId, @sourceType, @sourceApp, @occurredAt, @fetchedAt,
        @rangeStart, @rangeEnd, @sourceKey, @cwd, @title, @payloadJson
      )
    `);

    const transaction = this.db.transaction((items: RawRecord[]) => {
      for (const record of items) {
        insert.run({
          ...record,
          payloadJson: JSON.stringify(record.payload),
        });
      }
    });

    const before = this.count();
    transaction(records);
    return this.count() - before;
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM raw_records").get() as { count: number };
    return row.count;
  }
}
