import type { EventRecord } from "../types/event.js";

export function formatEventsTable(events: EventRecord[]): string {
  return events
    .map((event) => {
      const pieces = [
        event.occurredAt,
        event.sourceApp,
        event.actor,
        event.eventKind,
        event.cwd ?? "-",
        event.contentRedacted.replace(/\s+/g, " ").trim(),
      ];
      return pieces.join("\t");
    })
    .join("\n");
}

function escapeCsv(value: string | null): string {
  const normalized = (value ?? "").replace(/\r?\n/g, "\\n");
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function formatEventsJsonl(events: EventRecord[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

export function formatEventsCsv(events: EventRecord[]): string {
  const header = [
    "occurredAt",
    "sourceType",
    "sourceApp",
    "eventKind",
    "actor",
    "cwd",
    "title",
    "contentRedacted",
  ].join(",");

  const rows = events.map((event) =>
    [
      escapeCsv(event.occurredAt),
      escapeCsv(event.sourceType),
      escapeCsv(event.sourceApp),
      escapeCsv(event.eventKind),
      escapeCsv(event.actor),
      escapeCsv(event.cwd),
      escapeCsv(event.title),
      escapeCsv(event.contentRedacted),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}
