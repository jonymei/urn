import Database from "better-sqlite3";
import type { QueryFilter } from "../types/query.js";
import type { EventRecord } from "../types/event.js";

export class EventRepo {
  constructor(private readonly db: Database.Database) {}

  insertMany(events: EventRecord[]): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO events (
        id, raw_record_id, node_id, source_type, source_app, event_kind,
        actor, occurred_at, captured_at, cwd, project_hint, title,
        content, content_redacted, metadata_json
      ) VALUES (
        @id, @rawRecordId, @nodeId, @sourceType, @sourceApp, @eventKind,
        @actor, @occurredAt, @capturedAt, @cwd, @projectHint, @title,
        @content, @contentRedacted, @metadataJson
      )
    `);

    const transaction = this.db.transaction((items: EventRecord[]) => {
      for (const event of items) {
        insert.run({
          ...event,
          metadataJson: JSON.stringify(event.metadata),
        });
      }
    });

    const before = this.count();
    transaction(events);
    return this.count() - before;
  }

  query(filter: QueryFilter): EventRecord[] {
    const clauses = ["1=1"];
    const params: Record<string, unknown> = {};

    if (filter.sourceType && filter.sourceType !== "all") {
      clauses.push("source_type = @sourceType");
      params.sourceType = filter.sourceType;
    }

    if (filter.sourceApp && filter.sourceApp !== "all") {
      clauses.push("source_app = @sourceApp");
      params.sourceApp = filter.sourceApp;
    }

    if (filter.nodeId) {
      clauses.push("node_id = @nodeId");
      params.nodeId = filter.nodeId;
    }

    if (filter.start) {
      clauses.push("occurred_at >= @start");
      params.start = filter.start;
    }

    if (filter.end) {
      clauses.push("occurred_at <= @end");
      params.end = filter.end;
    }

    const limit = filter.limit ? "LIMIT @limit" : "";
    if (filter.limit) {
      params.limit = filter.limit;
    }

    const rows = this.db.prepare(`
      SELECT *
      FROM events
      WHERE ${clauses.join(" AND ")}
      ORDER BY occurred_at ASC
      ${limit}
    `).all(params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      rawRecordId: String(row.raw_record_id),
      nodeId: String(row.node_id),
      sourceType: row.source_type as EventRecord["sourceType"],
      sourceApp: String(row.source_app),
      eventKind: String(row.event_kind),
      actor: row.actor as EventRecord["actor"],
      occurredAt: String(row.occurred_at),
      capturedAt: String(row.captured_at),
      cwd: typeof row.cwd === "string" ? row.cwd : null,
      projectHint: typeof row.project_hint === "string" ? row.project_hint : null,
      title: typeof row.title === "string" ? row.title : null,
      content: String(row.content),
      contentRedacted: String(row.content_redacted),
      metadata: JSON.parse(String(row.metadata_json)) as Record<string, unknown>,
    }));
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    return row.count;
  }
}
