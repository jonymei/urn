import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { FetchContext, SourceFetcher } from "../../core/types/fetch.js";
import type { RawRecord } from "../../core/types/raw-record.js";
import type { FetchWindow } from "../../core/types/query.js";
import { stableHash } from "../../shared/hash.js";
import { getWindowBounds, toIsoString, toTimestamp } from "../../shared/time.js";

const SEP = "\u001f";

type MessageRole = "user" | "assistant";

interface SessionMessage {
  role: MessageRole;
  content: string;
  timestamp: number;
}

interface SessionRecord {
  id: string;
  tool: string;
  title: string;
  cwd: string | null;
  updatedAt: number;
  messages: SessionMessage[];
}

function viewerHome(): string {
  return process.env.AI_SESSION_VIEWER_HOME || os.homedir();
}

function quoteSql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function readSqlite(dbPath: string, sql: string): string {
  return execFileSync("sqlite3", ["-separator", SEP, dbPath, sql], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 10000,
  });
}

function extractTextParts(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }
      if (!block || typeof block !== "object") {
        return "";
      }
      const item = block as Record<string, unknown>;
      if (!["text", "input_text", "output_text"].includes(String(item.type || ""))) {
        return "";
      }
      const text = item.text ?? item.content;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isNoiseUserMessage(content: string): boolean {
  const text = content.trim();
  if (!text) {
    return true;
  }
  if (/^<environment_context>[\s\S]*<\/environment_context>$/.test(text)) {
    return true;
  }
  if (/^# AGENTS\.md instructions for\s+/m.test(text)) {
    return true;
  }
  if (/^<local-command-caveat>/m.test(text)) {
    return true;
  }
  return false;
}

function pushMessage(messages: SessionMessage[], role: MessageRole, content: string, timestamp: number): void {
  const text = content.trim();
  if (!text) {
    return;
  }
  if (role === "user" && isNoiseUserMessage(text)) {
    return;
  }
  const previous = messages.at(-1);
  if (previous && previous.role === role && previous.content === text) {
    return;
  }
  messages.push({ role, content: text, timestamp });
}

function clipTitle(content: string, fallback: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 100);
}

function parseClaude(bounds: { start: Date; end: Date }): SessionRecord[] {
  const baseDir = process.env.AI_SESSION_VIEWER_CLAUDE_DIR || path.join(viewerHome(), ".claude", "projects");
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const sessions: SessionRecord[] = [];
  for (const projectDirName of fs.readdirSync(baseDir)) {
    const projectDir = path.join(baseDir, projectDirName);
    if (!fs.statSync(projectDir).isDirectory()) {
      continue;
    }
    for (const file of fs.readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) {
        continue;
      }
      const filePath = path.join(projectDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtime < bounds.start || stat.mtime > bounds.end) {
        continue;
      }
      const messages: SessionMessage[] = [];
      let cwd: string | null = null;
      for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
        if (!line.trim()) {
          continue;
        }
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          const type = String(entry.type || "");
          if (type !== "user" && type !== "assistant") {
            continue;
          }
          if (!cwd && typeof entry.cwd === "string" && entry.cwd.trim()) {
            cwd = entry.cwd;
          }
          const message = entry.message as Record<string, unknown> | undefined;
          if (!message) {
            continue;
          }
          const text = extractTextParts(message.content);
          pushMessage(messages, type, text, toTimestamp(entry.timestamp, stat.mtimeMs));
        } catch {
          continue;
        }
      }
      if (messages.length === 0) {
        continue;
      }
      sessions.push({
        id: file.replace(/\.jsonl$/, ""),
        tool: "claude",
        title: clipTitle(messages.find((message) => message.role === "user")?.content || "", file),
        cwd,
        updatedAt: stat.mtimeMs,
        messages,
      });
    }
  }
  return sessions;
}

function parseCodex(bounds: { start: Date; end: Date }): SessionRecord[] {
  const dbPath = process.env.AI_SESSION_VIEWER_CODEX_DB || path.join(viewerHome(), ".codex", "state_5.sqlite");
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const sql = [
    "SELECT id, rollout_path, title, cwd, updated_at, first_user_message",
    "FROM threads",
    `WHERE updated_at BETWEEN ${Math.floor(bounds.start.getTime() / 1000)} AND ${Math.floor(bounds.end.getTime() / 1000)}`,
    "ORDER BY updated_at DESC",
  ].join(" ");

  let output = "";
  try {
    output = readSqlite(dbPath, sql);
  } catch {
    return [];
  }

  const sessions: SessionRecord[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const [id = "", rolloutPath = "", title = "", cwd = "", updatedAt = "0", firstUserMessage = ""] = line.split(SEP);
    if (!id || !rolloutPath || !fs.existsSync(rolloutPath)) {
      continue;
    }
    const messages: SessionMessage[] = [];
    for (const entryLine of fs.readFileSync(rolloutPath, "utf-8").split("\n")) {
      if (!entryLine.trim()) {
        continue;
      }
      try {
        const entry = JSON.parse(entryLine) as Record<string, unknown>;
        const timestamp = toTimestamp(entry.timestamp, Number(updatedAt) * 1000);
        if (entry.type === "response_item") {
          const payload = entry.payload as Record<string, unknown> | undefined;
          if (!payload || payload.type !== "message") {
            continue;
          }
          const role = payload.role;
          if (role !== "user" && role !== "assistant") {
            continue;
          }
          const content = extractTextParts(payload.content) || (typeof payload.message === "string" ? payload.message : "");
          pushMessage(messages, role, content, timestamp);
          continue;
        }
        if (entry.type === "event_msg") {
          const payload = entry.payload as Record<string, unknown> | undefined;
          if (!payload) {
            continue;
          }
          if (payload.type === "user_message") {
            pushMessage(messages, "user", String(payload.message || ""), timestamp);
          } else if (payload.type === "agent_message") {
            const phase = String(payload.phase || "");
            if (phase === "commentary" || phase === "thinking") {
              continue;
            }
            pushMessage(messages, "assistant", String(payload.message || ""), timestamp);
          }
        }
      } catch {
        continue;
      }
    }
    if (messages.length === 0) {
      continue;
    }
    sessions.push({
      id,
      tool: "codex",
      title: clipTitle(title || messages.find((message) => message.role === "user")?.content || firstUserMessage, id),
      cwd: cwd || null,
      updatedAt: Number(updatedAt) * 1000,
      messages,
    });
  }
  return sessions;
}

function findOpenCodeDb(): string | null {
  const explicit = process.env.AI_SESSION_VIEWER_OPENCODE_DB;
  if (explicit) {
    return explicit;
  }
  const home = viewerHome();
  const candidates = [
    path.join(home, ".local", "share", "opencode", "opencode.db"),
    path.join(home, ".local", "share", "opencode", "data", "opencode", "opencode.db"),
    path.join(home, ".config", "opencode", "data", "opencode", "opencode.db"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const appSupport = path.join(home, "Library", "Application Support");
  if (!fs.existsSync(appSupport)) {
    return null;
  }
  for (const entry of fs.readdirSync(appSupport, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(appSupport, entry.name, "opencode", "data", "opencode", "opencode.db");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseOpenCode(bounds: { start: Date; end: Date }): SessionRecord[] {
  const dbPath = findOpenCodeDb();
  if (!dbPath) {
    return [];
  }
  const sql = [
    "SELECT s.id, s.title, s.directory, s.time_updated, p.worktree",
    "FROM session s",
    "LEFT JOIN project p ON p.id = s.project_id",
    `WHERE s.time_updated BETWEEN ${bounds.start.getTime()} AND ${bounds.end.getTime()}`,
    "AND s.time_archived IS NULL",
    "ORDER BY s.time_updated DESC",
  ].join(" ");

  let output = "";
  try {
    output = readSqlite(`file:${dbPath}?immutable=1`, sql);
  } catch {
    return [];
  }

  const sessions: SessionRecord[] = [];
  for (const row of output.split("\n")) {
    if (!row.trim()) {
      continue;
    }
    const [id = "", title = "", directory = "", timeUpdated = "0", worktree = ""] = row.split(SEP);
    if (!id) {
      continue;
    }
    const partsSql = [
      "SELECT m.id, m.data, p.data, p.time_created",
      "FROM message m",
      "JOIN part p ON p.message_id = m.id",
      `WHERE m.session_id = ${quoteSql(id)}`,
      "ORDER BY p.time_created ASC, p.id ASC",
    ].join(" ");

    let parts = "";
    try {
      parts = readSqlite(`file:${dbPath}?immutable=1`, partsSql);
    } catch {
      continue;
    }

    const grouped = new Map<string, SessionMessage>();
    for (const partRow of parts.split("\n")) {
      if (!partRow.trim()) {
        continue;
      }
      const [messageId = "", messageDataRaw = "", partDataRaw = "", timeCreated = "0"] = partRow.split(SEP);
      try {
        const messageData = JSON.parse(messageDataRaw) as Record<string, unknown>;
        const partData = JSON.parse(partDataRaw) as Record<string, unknown>;
        if (partData.type !== "text") {
          continue;
        }
        const role = messageData.role;
        if (role !== "user" && role !== "assistant") {
          continue;
        }
        const text = typeof partData.text === "string" ? partData.text.trim() : "";
        if (!text) {
          continue;
        }
        const existing = grouped.get(messageId);
        if (existing) {
          existing.content = `${existing.content}\n${text}`.trim();
        } else {
          grouped.set(messageId, {
            role,
            content: text,
            timestamp: Number(timeCreated),
          });
        }
      } catch {
        continue;
      }
    }
    const messages = Array.from(grouped.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (messages.length === 0) {
      continue;
    }
    sessions.push({
      id,
      tool: "opencode",
      title: clipTitle(title === "新会话" ? messages.find((message) => message.role === "user")?.content || title : title, id),
      cwd: worktree && worktree !== "/" ? worktree : directory || null,
      updatedAt: Number(timeUpdated),
      messages,
    });
  }
  return sessions;
}

function findAlmaDb(): string | null {
  const explicit = process.env.AI_SESSION_VIEWER_ALMA_DB;
  if (explicit) {
    return explicit;
  }
  const dbPath = path.join(viewerHome(), "Library", "Application Support", "alma", "chat_threads.db");
  return fs.existsSync(dbPath) ? dbPath : null;
}

function parseAlma(bounds: { start: Date; end: Date }): SessionRecord[] {
  const dbPath = findAlmaDb();
  if (!dbPath) {
    return [];
  }
  const sql = [
    "SELECT t.id, t.title, t.updated_at, COALESCE(w.path, '')",
    "FROM chat_threads t",
    "LEFT JOIN workspaces w ON w.id = t.workspace_id",
    `WHERE t.updated_at >= ${quoteSql(bounds.start.toISOString())}`,
    `AND t.updated_at <= ${quoteSql(bounds.end.toISOString())}`,
    "ORDER BY t.updated_at DESC",
  ].join(" ");

  let output = "";
  try {
    output = readSqlite(`file:${dbPath}?immutable=1`, sql);
  } catch {
    return [];
  }

  const sessions: SessionRecord[] = [];
  for (const row of output.split("\n")) {
    if (!row.trim()) {
      continue;
    }
    const [id = "", title = "", updatedAt = "", workspacePath = ""] = row.split(SEP);
    if (!id) {
      continue;
    }
    const messageSql = [
      "SELECT message, timestamp",
      "FROM chat_messages",
      `WHERE thread_id = ${quoteSql(id)}`,
      "ORDER BY timestamp ASC, id ASC",
    ].join(" ");

    let messagesOutput = "";
    try {
      messagesOutput = readSqlite(`file:${dbPath}?immutable=1`, messageSql);
    } catch {
      continue;
    }

    const messages: SessionMessage[] = [];
    for (const messageRow of messagesOutput.split("\n")) {
      if (!messageRow.trim()) {
        continue;
      }
      const [messageRaw = "", timestamp = ""] = messageRow.split(SEP);
      try {
        const parsed = JSON.parse(messageRaw) as Record<string, unknown>;
        const role = parsed.role;
        if (role !== "user" && role !== "assistant") {
          continue;
        }
        const parts = Array.isArray(parsed.parts) ? parsed.parts : [];
        const text = parts
          .map((part) => {
            if (!part || typeof part !== "object") {
              return "";
            }
            const entry = part as Record<string, unknown>;
            return entry.type === "text" && typeof entry.text === "string" ? entry.text : "";
          })
          .filter(Boolean)
          .join("\n")
          .trim();
        pushMessage(messages, role, text, toTimestamp(timestamp, Date.now()));
      } catch {
        continue;
      }
    }
    if (messages.length === 0) {
      continue;
    }
    sessions.push({
      id,
      tool: "alma",
      title: clipTitle(title || messages.find((message) => message.role === "user")?.content || id, id),
      cwd: workspacePath || null,
      updatedAt: Date.parse(updatedAt),
      messages,
    });
  }
  return sessions;
}

function sessionToRawRecord(
  session: SessionRecord,
  context: FetchContext,
  bounds: { start: Date; end: Date },
): RawRecord {
  const events = session.messages.map((message) => ({
    actor: message.role === "user" ? "user" : "agent",
    eventKind: message.role === "user" ? "user_prompt" : "agent_final_response",
    occurredAt: toIsoString(message.timestamp),
    title: session.title,
    content: message.content,
    metadata: {
      sessionId: session.id,
      tool: session.tool,
      role: message.role,
    },
  }));

  return {
    id: stableHash(context.nodeId, "agent_session", session.tool, session.id, String(session.updatedAt)),
    nodeId: context.nodeId,
    sourceType: "agent_session",
    sourceApp: session.tool,
    occurredAt: toIsoString(session.updatedAt),
    fetchedAt: context.fetchedAt,
    rangeStart: toIsoString(bounds.start),
    rangeEnd: toIsoString(bounds.end),
    sourceKey: session.id,
    cwd: session.cwd,
    title: session.title,
    payload: {
      sessionId: session.id,
      title: session.title,
      events,
    },
  };
}

export const agentSessionFetchers: SourceFetcher[] = [
  {
    definition: { id: "claude", type: "agent_session", app: "claude", title: "Claude Code Sessions" },
    fetch(window: FetchWindow, context: FetchContext): RawRecord[] {
      const bounds = getWindowBounds(window);
      return parseClaude(bounds).map((session) => sessionToRawRecord(session, context, bounds));
    },
  },
  {
    definition: { id: "codex", type: "agent_session", app: "codex", title: "Codex Sessions" },
    fetch(window: FetchWindow, context: FetchContext): RawRecord[] {
      const bounds = getWindowBounds(window);
      return parseCodex(bounds).map((session) => sessionToRawRecord(session, context, bounds));
    },
  },
  {
    definition: { id: "opencode", type: "agent_session", app: "opencode", title: "OpenCode Sessions" },
    fetch(window: FetchWindow, context: FetchContext): RawRecord[] {
      const bounds = getWindowBounds(window);
      return parseOpenCode(bounds).map((session) => sessionToRawRecord(session, context, bounds));
    },
  },
  {
    definition: { id: "alma", type: "agent_session", app: "alma", title: "Alma Sessions" },
    fetch(window: FetchWindow, context: FetchContext): RawRecord[] {
      const bounds = getWindowBounds(window);
      return parseAlma(bounds).map((session) => sessionToRawRecord(session, context, bounds));
    },
  },
];
