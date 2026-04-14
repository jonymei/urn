import type { EventRecord } from "../types/event.js";
import type { RawRecord } from "../types/raw-record.js";

export function dedupeRawRecords(records: RawRecord[]): RawRecord[] {
  return Array.from(new Map(records.map((record) => [record.id, record])).values());
}

export function dedupeEvents(events: EventRecord[]): EventRecord[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}
