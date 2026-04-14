import type { EventRecord } from "../types/event.js";
import { normalizeInlineText, renderTable } from "../../cli/output.js";

export function formatEventsTable(events: EventRecord[]): string {
  return renderTable({
    emptyMessage: "No events found for the selected window.",
    columns: [
      { key: "occurredAt", header: "Time", maxWidth: 24, minWidth: 19, required: true },
      { key: "sourceApp", header: "App", maxWidth: 12, minWidth: 6, required: true },
      { key: "actor", header: "Actor", maxWidth: 10, minWidth: 5, priority: 1 },
      { key: "eventKind", header: "Kind", maxWidth: 18, minWidth: 6, priority: 2 },
      { key: "cwd", header: "CWD", maxWidth: 28, minWidth: 8, priority: 4 },
      { key: "content", header: "Content", maxWidth: 48, minWidth: 12, priority: 3, required: true },
    ],
    rows: events.map((event) => ({
      occurredAt: event.occurredAt,
      sourceApp: event.sourceApp,
      actor: event.actor,
      eventKind: event.eventKind,
      cwd: event.cwd,
      content: normalizeInlineText(event.contentRedacted),
    })),
  });
}

function escapeCsv(value: string | null): string {
  const normalized = (value ?? "").replace(/\r?\n/g, "\\n");
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function formatEventsJsonl(events: EventRecord[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

export function formatEventsTsv(events: EventRecord[]): string {
  const header = [
    "occurredAt",
    "sourceType",
    "sourceApp",
    "eventKind",
    "actor",
    "cwd",
    "title",
    "contentRedacted",
  ].join("\t");

  const rows = events.map((event) =>
    [
      event.occurredAt,
      event.sourceType,
      event.sourceApp,
      event.eventKind,
      event.actor,
      event.cwd ?? "",
      event.title ?? "",
      event.contentRedacted.replace(/\r?\n/g, "\\n"),
    ].join("\t"),
  );

  return [header, ...rows].join("\n");
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
