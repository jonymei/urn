import type { SourceType } from "./source.js";

export type FetchWindow =
  | { kind: "day"; date: string; timezone: string }
  | { kind: "range"; start: string; end: string; timezone: string }
  | { kind: "recent"; amount: number; unit: "hours" | "days"; timezone: string };

export interface QueryFilter {
  sourceType?: SourceType | "all";
  sourceApp?: string | "all";
  nodeId?: string;
  start?: string;
  end?: string;
  limit?: number;
}
