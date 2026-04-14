import type { RawRecord } from "./raw-record.js";
import type { FetchWindow } from "./query.js";
import type { SourceDefinition } from "./source.js";

export interface FetchContext {
  nodeId: string;
  fetchedAt: string;
}

export interface SourceFetcher {
  definition: SourceDefinition;
  fetch(window: FetchWindow, context: FetchContext): RawRecord[];
}
