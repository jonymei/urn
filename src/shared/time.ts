import type { FetchWindow } from "../core/types/query.js";

export interface WindowBounds {
  start: Date;
  end: Date;
}

function parseLocalDateTime(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00`);
  }
  return new Date(input);
}

export function getWindowBounds(window: FetchWindow): WindowBounds {
  if (window.kind === "day") {
    return {
      start: parseLocalDateTime(`${window.date}T00:00:00`),
      end: parseLocalDateTime(`${window.date}T23:59:59.999`),
    };
  }

  if (window.kind === "range") {
    return {
      start: parseLocalDateTime(window.start),
      end: parseLocalDateTime(window.end),
    };
  }

  const end = new Date();
  const start = new Date(end.getTime());
  if (window.unit === "hours") {
    start.setHours(start.getHours() - window.amount);
  } else {
    start.setDate(start.getDate() - window.amount);
  }

  return { start, end };
}

export function getDateInTimezone(timezone: string, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to format date for timezone: ${timezone}`);
  }
  return `${year}-${month}-${day}`;
}

export function toIsoString(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function toTimestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function parseRecent(value: string): { amount: number; unit: "hours" | "days" } {
  const match = value.trim().match(/^(\d+)([hd])$/i);
  if (!match) {
    throw new Error("Invalid recent format. Use 12h or 7d");
  }
  return {
    amount: Number(match[1]),
    unit: match[2].toLowerCase() === "h" ? "hours" : "days",
  };
}
