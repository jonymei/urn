import type { SourceType } from "./source.js";

export interface RawRecord {
  id: string;
  nodeId: string;
  sourceType: SourceType;
  sourceApp: string;
  occurredAt: string;
  fetchedAt: string;
  rangeStart: string;
  rangeEnd: string;
  sourceKey: string;
  cwd: string | null;
  title: string | null;
  payload: unknown;
}
