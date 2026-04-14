import type Database from "better-sqlite3";
import type { FetchWindow } from "../types/query.js";
import type { SourceFetcher } from "../types/fetch.js";
import { normalizeRawRecord } from "./normalizer.js";
import { dedupeEvents, dedupeRawRecords } from "./dedupe.js";
import { redactPayload } from "./redact.js";
import { RawRecordRepo } from "../storage/raw-record-repo.js";
import { EventRepo } from "../storage/event-repo.js";

export interface IngestResult {
  rawRecordsRead: number;
  rawRecordsInserted: number;
  eventsInserted: number;
}

export class IngestPipeline {
  private readonly rawRecordRepo: RawRecordRepo;
  private readonly eventRepo: EventRepo;

  constructor(
    private readonly db: Database.Database,
    private readonly nodeId: string,
  ) {
    this.rawRecordRepo = new RawRecordRepo(db);
    this.eventRepo = new EventRepo(db);
  }

  run(fetchers: SourceFetcher[], window: FetchWindow): IngestResult {
    const fetchedAt = new Date().toISOString();
    const rawRecords = dedupeRawRecords(
      fetchers.flatMap((fetcher) =>
        fetcher.fetch(window, {
          nodeId: this.nodeId,
          fetchedAt,
        }),
      ),
    ).map((record) => ({
      ...record,
      payload: redactPayload(record.payload),
    }));

    const events = dedupeEvents(rawRecords.flatMap((record) => normalizeRawRecord(record)));
    const rawRecordsInserted = this.rawRecordRepo.insertMany(rawRecords);
    const eventsInserted = this.eventRepo.insertMany(events);

    this.db.prepare(`
      INSERT OR IGNORE INTO nodes (id, name, kind)
      VALUES (?, ?, 'local')
    `).run(this.nodeId, this.nodeId);

    return {
      rawRecordsRead: rawRecords.length,
      rawRecordsInserted,
      eventsInserted,
    };
  }
}
