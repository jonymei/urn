import type { EventRecord } from "../types/event.js";
import type { RawRecord } from "../types/raw-record.js";
import { stableHash } from "../../shared/hash.js";
import { redactContent } from "./redact.js";

export function createEvent(input: Omit<EventRecord, "id" | "contentRedacted">): EventRecord {
  const contentRedacted = redactContent(input.content);
  return {
    ...input,
    id: stableHash(
      input.rawRecordId,
      input.eventKind,
      input.actor,
      input.occurredAt,
      contentRedacted,
    ),
    contentRedacted,
  };
}

export function normalizeRawRecord(record: RawRecord): EventRecord[] {
  const payload = record.payload as Record<string, unknown>;
  const events = Array.isArray(payload["events"])
    ? payload["events"] as Array<Record<string, unknown>>
    : [];

  if (events.length > 0) {
    return events
      .map((entry) => {
        const content = typeof entry["content"] === "string" ? entry["content"].trim() : "";
        if (!content) {
          return null;
        }
        const actor = entry["actor"];
        if (actor !== "user" && actor !== "agent" && actor !== "browser" && actor !== "shell") {
          return null;
        }
        const eventKind = typeof entry["eventKind"] === "string" ? entry["eventKind"] : "message";
        const occurredAt = typeof entry["occurredAt"] === "string" ? entry["occurredAt"] : record.occurredAt;
        return createEvent({
          rawRecordId: record.id,
          nodeId: record.nodeId,
          sourceType: record.sourceType,
          sourceApp: record.sourceApp,
          eventKind,
          actor,
          occurredAt,
          capturedAt: record.fetchedAt,
          cwd: record.cwd,
          projectHint: record.cwd,
          title: typeof entry["title"] === "string" ? entry["title"] : record.title,
          content,
          metadata: (entry["metadata"] && typeof entry["metadata"] === "object"
            ? entry["metadata"]
            : {}) as Record<string, unknown>,
        });
      })
      .filter((event): event is EventRecord => Boolean(event));
  }

  const fallbackContent = typeof payload["content"] === "string" ? payload["content"] : "";
  if (!fallbackContent) {
    return [];
  }

  return [
    createEvent({
      rawRecordId: record.id,
      nodeId: record.nodeId,
      sourceType: record.sourceType,
      sourceApp: record.sourceApp,
      eventKind: "record",
      actor: "agent",
      occurredAt: record.occurredAt,
      capturedAt: record.fetchedAt,
      cwd: record.cwd,
      projectHint: record.cwd,
      title: record.title,
      content: fallbackContent,
      metadata: {},
    }),
  ];
}
