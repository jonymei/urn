import type { SourceType } from "./source.js";

export type EventActor = "user" | "agent" | "browser" | "shell";

export interface EventRecord {
  id: string;
  rawRecordId: string;
  nodeId: string;
  sourceType: SourceType;
  sourceApp: string;
  eventKind: string;
  actor: EventActor;
  occurredAt: string;
  capturedAt: string;
  cwd: string | null;
  projectHint: string | null;
  title: string | null;
  content: string;
  contentRedacted: string;
  metadata: Record<string, unknown>;
}
