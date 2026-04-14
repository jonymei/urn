import { accessSync, constants, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { FetchContext, SourceFetcher } from "../../core/types/fetch.js";
import type { FetchWindow } from "../../core/types/query.js";
import type { RawRecord } from "../../core/types/raw-record.js";
import { stableHash } from "../../shared/hash.js";
import { getWindowBounds, toIsoString } from "../../shared/time.js";

interface BrowserEntry {
  browser: string;
  url: string;
  title: string;
  timestamp: Date;
}

const homeDir = os.homedir();

const browserPaths: Record<string, string> = {
  safari: path.join(homeDir, "Library", "Safari", "History.db"),
  chrome: path.join(homeDir, "Library", "Application Support", "Google", "Chrome", "Default", "History"),
  edge: path.join(homeDir, "Library", "Application Support", "Microsoft Edge", "Default", "History"),
};

function cleanupTempDb(tmpPath: string): void {
  rmSync(path.dirname(tmpPath), { recursive: true, force: true });
}

function copyDbToTemp(dbPath: string, browserName: string): string | null {
  if (!existsSync(dbPath)) {
    return null;
  }
  try {
    accessSync(dbPath, constants.R_OK);
  } catch {
    return null;
  }
  const tmpDir = path.join(os.tmpdir(), `urn-browser-${browserName}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const fileName = path.basename(dbPath);
  const tmpPath = path.join(tmpDir, fileName);
  copyFileSync(dbPath, tmpPath);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (existsSync(sidecarPath)) {
      copyFileSync(sidecarPath, `${tmpPath}${suffix}`);
    }
  }
  return tmpPath;
}

function extractSafari(bounds: { start: Date; end: Date }): BrowserEntry[] {
  const tmpPath = copyDbToTemp(browserPaths.safari, "safari");
  if (!tmpPath) {
    return [];
  }
  const db = new Database(tmpPath, { readonly: true });
  let rows: Array<{ url: string; title: string; visit_time: number }> = [];
  try {
    rows = db.prepare(`
      SELECT h.url, COALESCE(h.title, v.title, '') AS title, v.visit_time
      FROM history_visits v
      JOIN history_items h ON COALESCE(v.history_item, v.history_item_id) = h.id
      WHERE v.visit_time >= ? AND v.visit_time <= ?
      ORDER BY v.visit_time ASC
    `).all(
      Math.floor(bounds.start.getTime() / 1000) - 978307200,
      Math.floor(bounds.end.getTime() / 1000) - 978307200,
    ) as Array<{ url: string; title: string; visit_time: number }>;
  } catch {
    rows = [];
  }
  db.close();
  cleanupTempDb(tmpPath);
  return rows.map((row) => ({
    browser: "safari",
    url: row.url,
    title: row.title || "",
    timestamp: new Date((row.visit_time + 978307200) * 1000),
  }));
}

function extractChromium(browser: "chrome" | "edge", bounds: { start: Date; end: Date }): BrowserEntry[] {
  const dbPath = browserPaths[browser];
  const tmpPath = copyDbToTemp(dbPath, browser);
  if (!tmpPath) {
    return [];
  }
  const db = new Database(tmpPath, { readonly: true });
  let rows: Array<{ url: string; title: string; visit_time: string | number }> = [];
  try {
    rows = db.prepare(`
      SELECT u.url, u.title, v.visit_time
      FROM visits v
      JOIN urls u ON v.url = u.id
      WHERE v.visit_time >= ? AND v.visit_time <= ?
      ORDER BY v.visit_time ASC
    `).all(
      bounds.start.getTime() * 1000 + 11644473600000000,
      bounds.end.getTime() * 1000 + 11644473600000000,
    ) as Array<{ url: string; title: string; visit_time: string | number }>;
  } catch {
    rows = [];
  }
  db.close();
  cleanupTempDb(tmpPath);
  return rows.map((row) => ({
    browser,
    url: row.url,
    title: row.title || "",
    timestamp: new Date((Number(row.visit_time) - 11644473600000000) / 1000),
  }));
}

function extract(browser: string, bounds: { start: Date; end: Date }): BrowserEntry[] {
  if (browser === "safari") {
    return extractSafari(bounds);
  }
  if (browser === "chrome" || browser === "edge") {
    return extractChromium(browser, bounds);
  }
  return [];
}

function entryToRawRecord(
  entry: BrowserEntry,
  context: FetchContext,
  bounds: { start: Date; end: Date },
): RawRecord {
  const occurredAt = toIsoString(entry.timestamp);
  return {
    id: stableHash(context.nodeId, "browser_history", entry.browser, occurredAt, entry.url),
    nodeId: context.nodeId,
    sourceType: "browser_history",
    sourceApp: entry.browser,
    occurredAt,
    fetchedAt: context.fetchedAt,
    rangeStart: toIsoString(bounds.start),
    rangeEnd: toIsoString(bounds.end),
    sourceKey: `${entry.browser}:${entry.url}:${occurredAt}`,
    cwd: null,
    title: entry.title || null,
    payload: {
      browser: entry.browser,
      url: entry.url,
      title: entry.title,
      events: [
        {
          actor: "browser",
          eventKind: "page_visit",
          occurredAt,
          title: entry.title,
          content: `${entry.title}\n${entry.url}`.trim(),
          metadata: {
            url: entry.url,
            browser: entry.browser,
          },
        },
      ],
    },
  };
}

export const browserHistoryFetchers: SourceFetcher[] = Object.keys(browserPaths).map((browser) => ({
  definition: {
    id: browser,
    type: "browser_history",
    app: browser,
    title: `${browser} Browser History`,
  },
  fetch(window: FetchWindow, context: FetchContext): RawRecord[] {
    const bounds = getWindowBounds(window);
    return extract(browser, bounds).map((entry) => entryToRawRecord(entry, context, bounds));
  },
}));

export const browserHistoryTestUtils = {
  copyDbToTemp,
  extractSafari,
  browserPaths,
};
