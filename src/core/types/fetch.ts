import type { RawRecord } from "./raw-record.js";
import type { FetchWindow } from "./query.js";
import type { SourceDefinition } from "./source.js";

export interface SyncCursor {
  updatedAt?: number;
}

export interface FetchContext {
  nodeId: string;
  fetchedAt: string;
}

export interface SyncContext extends FetchContext {
  cursor?: SyncCursor;
  overlapMs: number;
}

export interface SyncResult {
  records: RawRecord[];
  nextCursor?: SyncCursor;
}

export interface SourceFetcher {
  definition: SourceDefinition;
  fetch(window: FetchWindow, context: FetchContext): RawRecord[];
  sync?(context: SyncContext): SyncResult;
}
