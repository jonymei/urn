import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FetchContext, SourceFetcher } from "../../core/types/fetch.js";
import type { FetchWindow } from "../../core/types/query.js";
import type { RawRecord } from "../../core/types/raw-record.js";
import { stableHash } from "../../shared/hash.js";
import { getWindowBounds, toIsoString } from "../../shared/time.js";

interface ShellEntry {
  shell: string;
  command: string;
  timestamp: Date | null;
  cwd: string | null;
}

interface TimedShellEntry extends ShellEntry {
  timestamp: Date;
}

const home = os.homedir();

const shellPaths: Record<string, string> = {
  bash: path.join(home, ".bash_history"),
  zsh: path.join(home, ".zsh_history"),
  fish: path.join(home, ".local", "share", "fish", "fish_history"),
};

function hasTimestamp(entry: ShellEntry): entry is TimedShellEntry {
  return entry.timestamp instanceof Date;
}

function parseBash(filePath: string, bounds: { start: Date; end: Date }): TimedShellEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const entries: ShellEntry[] = [];
  let currentTimestamp: Date | null = null;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    if (/^#\d{9,}$/.test(line.trim())) {
      currentTimestamp = new Date(Number(line.trim().slice(1)) * 1000);
      continue;
    }
    entries.push({
      shell: "bash",
      command: line.trim(),
      timestamp: currentTimestamp,
      cwd: null,
    });
    currentTimestamp = null;
  }
  return entries.filter(hasTimestamp).filter((entry) => entry.timestamp >= bounds.start && entry.timestamp <= bounds.end);
}

function parseZsh(filePath: string, bounds: { start: Date; end: Date }): TimedShellEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const entries: ShellEntry[] = [];
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^: (\d+):\d+;(.*)$/);
    if (!match) {
      continue;
    }
    entries.push({
      shell: "zsh",
      command: match[2].trim(),
      timestamp: new Date(Number(match[1]) * 1000),
      cwd: null,
    });
  }
  return entries.filter(hasTimestamp).filter((entry) => entry.command && entry.timestamp >= bounds.start && entry.timestamp <= bounds.end);
}

function parseFish(filePath: string, bounds: { start: Date; end: Date }): TimedShellEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const entries: ShellEntry[] = [];
  let currentCommand = "";
  let currentTimestamp: Date | null = null;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (line.startsWith("- cmd: ")) {
      currentCommand = line.slice(7).trim();
      currentTimestamp = null;
      continue;
    }
    if (line.trim().startsWith("when: ")) {
      currentTimestamp = new Date(Number(line.trim().slice(6)) * 1000);
      if (currentCommand) {
        entries.push({
          shell: "fish",
          command: currentCommand,
          timestamp: currentTimestamp,
          cwd: null,
        });
      }
      currentCommand = "";
      currentTimestamp = null;
    }
  }
  return entries.filter(hasTimestamp).filter((entry) => entry.timestamp >= bounds.start && entry.timestamp <= bounds.end);
}

function parseShell(shell: string, filePath: string, bounds: { start: Date; end: Date }): TimedShellEntry[] {
  if (shell === "bash") {
    return parseBash(filePath, bounds);
  }
  if (shell === "zsh") {
    return parseZsh(filePath, bounds);
  }
  if (shell === "fish") {
    return parseFish(filePath, bounds);
  }
  return [];
}

function toRawRecord(
  entry: TimedShellEntry,
  context: FetchContext,
  bounds: { start: Date; end: Date },
): RawRecord {
  const occurredAt = toIsoString(entry.timestamp);
  return {
    id: stableHash(context.nodeId, "shell_history", entry.shell, occurredAt, entry.command),
    nodeId: context.nodeId,
    sourceType: "shell_history",
    sourceApp: entry.shell,
    occurredAt,
    fetchedAt: context.fetchedAt,
    rangeStart: toIsoString(bounds.start),
    rangeEnd: toIsoString(bounds.end),
    sourceKey: `${entry.shell}:${occurredAt}:${entry.command}`,
    cwd: entry.cwd,
    title: null,
    payload: {
      shell: entry.shell,
      command: entry.command,
      cwd: entry.cwd,
      events: [
        {
          actor: "shell",
          eventKind: "shell_command",
          occurredAt,
          content: entry.command,
          metadata: {
            shell: entry.shell,
            cwd: entry.cwd,
          },
        },
      ],
    },
  };
}

export const shellHistoryFetchers: SourceFetcher[] = Object.entries(shellPaths).map(([shell, filePath]) => ({
  definition: {
    id: shell,
    type: "shell_history",
    app: shell,
    title: `${shell} Shell History`,
  },
  fetch(window: FetchWindow, context: FetchContext): RawRecord[] {
    const bounds = getWindowBounds(window);
    return parseShell(shell, filePath, bounds).map((entry) => toRawRecord(entry, context, bounds));
  },
}));
