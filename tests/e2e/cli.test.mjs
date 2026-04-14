import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = path.join(PROJECT_ROOT, "dist", "cli", "index.js");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function sqlite(dbPath, sql) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  execFileSync("sqlite3", [dbPath, sql], { stdio: "pipe" });
}

function toChromiumVisitTime(iso) {
  return String(new Date(iso).getTime() * 1000 + 11644473600000000);
}

test("ingest and query merge agent sessions and shell history into normalized events", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-"));
  const dbPath = path.join(tempHome, "urn.db");

  const claudeFile = path.join(
    tempHome,
    ".claude",
    "projects",
    "-Users-test-demo",
    "claude-session.jsonl",
  );
  writeFile(
    claudeFile,
    [
      JSON.stringify({
        type: "user",
        message: { content: "Claude user prompt with sk-1234567890abcdefghijkl" },
        timestamp: "2026-04-13T01:00:00.000Z",
        cwd: "/Users/test/demo",
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Claude answer" }] },
        timestamp: "2026-04-13T01:01:00.000Z",
        cwd: "/Users/test/demo",
      }),
      "",
    ].join("\n"),
  );
  fs.utimesSync(claudeFile, new Date("2026-04-13T01:00:00.000Z"), new Date("2026-04-13T01:01:00.000Z"));

  fs.writeFileSync(
    path.join(tempHome, ".zsh_history"),
    ": 1776042000:0;git status\n: 1776042060:0;echo hello\n",
  );
  fs.utimesSync(
    path.join(tempHome, ".zsh_history"),
    new Date("2026-04-13T01:00:00.000Z"),
    new Date("2026-04-13T01:05:00.000Z"),
  );

  const codexRollout = path.join(
    tempHome,
    ".codex",
    "sessions",
    "2026",
    "04",
    "13",
    "rollout-2026-04-13-thread-1.jsonl",
  );
  writeFile(
    codexRollout,
    [
      JSON.stringify({
        timestamp: "2026-04-13T02:00:01.000Z",
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Codex request" }] },
      }),
      JSON.stringify({
        timestamp: "2026-04-13T02:00:02.000Z",
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Codex answer" }] },
      }),
      "",
    ].join("\n"),
  );

  const codexDb = path.join(tempHome, ".codex", "state_5.sqlite");
  sqlite(
    codexDb,
    `
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        cwd TEXT NOT NULL,
        title TEXT NOT NULL,
        first_user_message TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO threads (id, rollout_path, updated_at, cwd, title, first_user_message)
      VALUES ('thread-1', '${codexRollout.replace(/'/g, "''")}', 1776045602, '/Users/test/codex-project', '', 'Codex request');
    `,
  );

  execFileSync("node", [CLI_PATH, "ingest", "--source", "all", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
      URN_NODE_ID: "local:test",
    },
    encoding: "utf-8",
  });

  const output = execFileSync("node", [
    CLI_PATH,
    "query",
    "--start",
    "2026-04-11T00:00:00.000Z",
    "--end",
    "2026-04-13T23:59:59.999Z",
    "--format",
    "json",
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
      URN_NODE_ID: "local:test",
    },
    encoding: "utf-8",
  });

  const rows = JSON.parse(output);
  assert.equal(rows.length, 6);
  assert.equal(rows.some((row) => row.sourceApp === "claude"), true);
  assert.equal(rows.some((row) => row.sourceApp === "codex"), true);
  assert.equal(rows.some((row) => row.sourceApp === "zsh"), true);
  const claudePrompt = rows.find((row) => row.sourceApp === "claude" && row.actor === "user");
  assert.match(claudePrompt.contentRedacted, /\*\*\*\*/);
  assert.equal(claudePrompt.cwd, "/Users/test/demo");
});

test("query supports jsonl and csv output", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-format-"));
  const dbPath = path.join(tempHome, "urn.db");

  fs.writeFileSync(
    path.join(tempHome, ".zsh_history"),
    ": 1776038400:0;git status\n",
  );

  execFileSync("node", [CLI_PATH, "ingest", "--source", "zsh", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const jsonl = execFileSync("node", [CLI_PATH, "query", "--source", "shell_history", "--day", "2026-04-13", "--format", "jsonl"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  }).trim();

  const csv = execFileSync("node", [CLI_PATH, "query", "--source", "shell_history", "--day", "2026-04-13", "--format", "csv"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  }).trim();

  assert.equal(JSON.parse(jsonl).contentRedacted, "git status");
  assert.match(csv, /occurredAt,sourceType,sourceApp,eventKind,actor,cwd,title,contentRedacted/);
  assert.match(csv, /git status/);
});

test("daily ingest profile prioritizes agent sessions, replays browser history, and skips shell by default", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-profile-"));
  const dbPath = path.join(tempHome, "urn.db");

  const claudeFile = path.join(
    tempHome,
    ".claude",
    "projects",
    "-Users-test-demo",
    "claude-session.jsonl",
  );
  writeFile(
    claudeFile,
    [
      JSON.stringify({
        type: "user",
        message: { content: "daily profile prompt" },
        timestamp: "2026-04-13T08:00:00.000Z",
        cwd: "/Users/test/demo",
      }),
      "",
    ].join("\n"),
  );
  fs.utimesSync(claudeFile, new Date("2026-04-13T08:00:00.000Z"), new Date("2026-04-13T08:00:00.000Z"));

  fs.writeFileSync(
    path.join(tempHome, ".zsh_history"),
    ": 1776038400:0;git status\n",
  );

  const chromeDb = path.join(
    tempHome,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Default",
    "History",
  );
  sqlite(
    chromeDb,
    `
      CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL);
      CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL);
      INSERT INTO urls (id, url, title) VALUES (1, 'https://example.com/overlap', 'Overlap Page');
      INSERT INTO visits (id, url, visit_time) VALUES (1, 1, ${toChromiumVisitTime("2026-04-11T06:00:00.000Z")});
    `,
  );

  const profileOutput = execFileSync("node", [CLI_PATH, "ingest", "--profile", "daily", "--day", "2026-04-13", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
      URN_NODE_ID: "local:test",
    },
    encoding: "utf-8",
  });

  const profile = JSON.parse(profileOutput);
  assert.equal(profile.profile, "daily");
  assert.deepEqual(profile.batches.map((batch) => batch.label), ["agent-sessions", "browser-history"]);

  const output = execFileSync("node", [
    CLI_PATH,
    "query",
    "--start",
    "2026-04-11T00:00:00.000Z",
    "--end",
    "2026-04-13T23:59:59.999Z",
    "--format",
    "json",
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
      URN_NODE_ID: "local:test",
    },
    encoding: "utf-8",
  });

  const rows = JSON.parse(output);
  assert.equal(rows.some((row) => row.sourceApp === "claude"), true);
  assert.equal(rows.some((row) => row.sourceApp === "chrome"), true);
  assert.equal(rows.some((row) => row.sourceApp === "zsh"), false);
});

test("daily ingest profile can include shell history explicitly", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-profile-shell-"));
  const dbPath = path.join(tempHome, "urn.db");

  fs.writeFileSync(
    path.join(tempHome, ".zsh_history"),
    ": 1776038400:0;git status\n",
  );

  execFileSync("node", [CLI_PATH, "ingest", "--profile", "daily", "--day", "2026-04-13", "--include-shell"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const output = execFileSync("node", [CLI_PATH, "query", "--day", "2026-04-13", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const rows = JSON.parse(output);
  assert.equal(rows.some((row) => row.sourceApp === "zsh"), true);
});

test("hourly sync uses cursors for agent sessions and replay windows for browser history", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-sync-"));
  const dbPath = path.join(tempHome, "urn.db");
  const now = Date.now();
  const sessionTime = new Date(now - 5 * 60 * 1000);
  const browserTime = new Date(now - 30 * 60 * 1000);

  const claudeFile = path.join(
    tempHome,
    ".claude",
    "projects",
    "-Users-test-sync",
    "claude-session.jsonl",
  );
  writeFile(
    claudeFile,
    [
      JSON.stringify({
        type: "user",
        message: { content: "sync prompt" },
        timestamp: sessionTime.toISOString(),
        cwd: "/Users/test/sync",
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "sync answer" }] },
        timestamp: new Date(sessionTime.getTime() + 1000).toISOString(),
        cwd: "/Users/test/sync",
      }),
      "",
    ].join("\n"),
  );
  fs.utimesSync(claudeFile, sessionTime, sessionTime);

  const chromeDb = path.join(
    tempHome,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "Default",
    "History",
  );
  sqlite(
    chromeDb,
    `
      CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL);
      CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL);
      INSERT INTO urls (id, url, title) VALUES (1, 'https://example.com/hourly', 'Hourly Page');
      INSERT INTO visits (id, url, visit_time) VALUES (1, 1, ${toChromiumVisitTime(browserTime.toISOString())});
    `,
  );

  const env = {
    ...process.env,
    HOME: tempHome,
    AI_SESSION_VIEWER_HOME: tempHome,
    URN_DB_PATH: dbPath,
    URN_NODE_ID: "local:test",
  };

  const firstSync = JSON.parse(execFileSync("node", [CLI_PATH, "sync", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  }));
  const secondSync = JSON.parse(execFileSync("node", [CLI_PATH, "sync", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  }));

  const firstClaude = firstSync.batches.find((batch) => batch.label === "claude");
  const secondClaude = secondSync.batches.find((batch) => batch.label === "claude");
  const secondBrowser = secondSync.batches.find((batch) => batch.label === "browser-history");

  assert.equal(firstSync.profile, "hourly");
  assert.equal(firstClaude.result.rawRecordsInserted, 1);
  assert.equal(secondClaude.result.rawRecordsInserted, 0);
  assert.equal(secondBrowser.result.rawRecordsInserted, 0);
  assert.equal(secondSync.batches.some((batch) => batch.label === "shell-history"), false);

  const output = execFileSync("node", [CLI_PATH, "query", "--recent", "2d", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  });
  const rows = JSON.parse(output);
  assert.equal(rows.some((row) => row.sourceApp === "claude"), true);
  assert.equal(rows.some((row) => row.sourceApp === "chrome"), true);
});

test("stats and summary expose aggregate and summary views", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-summary-"));
  const dbPath = path.join(tempHome, "urn.db");

  const claudeFile = path.join(
    tempHome,
    ".claude",
    "projects",
    "-Users-test-summary",
    "claude-session.jsonl",
  );
  writeFile(
    claudeFile,
    [
      JSON.stringify({
        type: "user",
        message: { content: "summary prompt" },
        timestamp: "2026-04-13T08:00:00.000Z",
        cwd: "/Users/test/summary",
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "summary answer" }] },
        timestamp: "2026-04-13T08:00:10.000Z",
        cwd: "/Users/test/summary",
      }),
      "",
    ].join("\n"),
  );
  fs.utimesSync(claudeFile, new Date("2026-04-13T08:00:00.000Z"), new Date("2026-04-13T08:00:10.000Z"));

  execFileSync("node", [CLI_PATH, "ingest", "--source", "claude", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const stats = JSON.parse(execFileSync("node", [CLI_PATH, "stats", "--day", "2026-04-13", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  }));

  const summary = JSON.parse(execFileSync("node", [CLI_PATH, "summary", "--day", "2026-04-13", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  }));

  assert.equal(stats.totalEvents, 2);
  assert.equal(stats.totalRawRecords, 1);
  assert.equal(stats.bySourceApp[0].key, "claude");
  assert.equal(summary.totals.events, 2);
  assert.equal(summary.topCwds[0].cwd, "/Users/test/summary");
  assert.equal(summary.topTitles[0].title, "summary prompt");
  assert.equal(summary.representativeEvents[0].content, "summary prompt");
});

test("default outputs are human friendly and keep CJK visible", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-human-"));
  const dbPath = path.join(tempHome, "urn.db");

  const claudeFile = path.join(
    tempHome,
    ".claude",
    "projects",
    "-Users-test-human",
    "claude-session.jsonl",
  );
  writeFile(
    claudeFile,
    [
      JSON.stringify({
        type: "user",
        message: { content: "整理中文输出体验" },
        timestamp: "2026-04-13T08:00:00.000Z",
        cwd: "/Users/test/中文项目",
      }),
      "",
    ].join("\n"),
  );
  fs.utimesSync(claudeFile, new Date("2026-04-13T08:00:00.000Z"), new Date("2026-04-13T08:00:00.000Z"));

  execFileSync("node", [CLI_PATH, "ingest", "--source", "claude", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const queryTable = execFileSync("node", [CLI_PATH, "query", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });
  const statsTable = execFileSync("node", [CLI_PATH, "stats", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });
  const summaryText = execFileSync("node", [CLI_PATH, "summary", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      AI_SESSION_VIEWER_HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  assert.match(queryTable, /Time\s+App\s+Actor\s+Kind/);
  assert.match(queryTable, /中文项目/);
  assert.match(queryTable, /整理中文输出体验/);
  assert.match(statsTable, /Totals/);
  assert.match(statsTable, /By Source App/);
  assert.match(summaryText, /Representative Events/);
  assert.match(summaryText, /整理中文输出体验/);
});

test("narrow terminals degrade tables and empty windows use consistent messages", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-narrow-"));
  const dbPath = path.join(tempHome, "urn.db");

  const claudeFile = path.join(
    tempHome,
    ".claude",
    "projects",
    "-Users-test-narrow",
    "claude-session.jsonl",
  );
  writeFile(
    claudeFile,
    [
      JSON.stringify({
        type: "user",
        message: { content: "检查窄终端下的中文表格输出" },
        timestamp: "2026-04-13T08:00:00.000Z",
        cwd: "/Users/test/超长中文项目路径/内部目录",
      }),
      "",
    ].join("\n"),
  );
  fs.utimesSync(claudeFile, new Date("2026-04-13T08:00:00.000Z"), new Date("2026-04-13T08:00:00.000Z"));

  const env = {
    ...process.env,
    HOME: tempHome,
    AI_SESSION_VIEWER_HOME: tempHome,
    URN_DB_PATH: dbPath,
    COLUMNS: "32",
    TZ: "Asia/Shanghai",
  };

  execFileSync("node", [CLI_PATH, "ingest", "--source", "claude", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  });

  const narrowQuery = execFileSync("node", [CLI_PATH, "query", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  });
  const emptyQuery = execFileSync("node", [CLI_PATH, "query", "--day", "2026-04-14"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  }).trim();
  const emptyStats = execFileSync("node", [CLI_PATH, "stats", "--day", "2026-04-14"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  }).trim();
  const emptySummary = execFileSync("node", [CLI_PATH, "summary", "--day", "2026-04-14"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  }).trim();

  assert.match(narrowQuery, /Time/);
  assert.match(narrowQuery, /App/);
  assert.match(narrowQuery, /Content/);
  assert.doesNotMatch(narrowQuery, /\bCWD\b/);
  assert.equal(emptyQuery, "Window: day 2026-04-14 (Asia/Shanghai)\nNo events found for the selected window.");
  assert.equal(emptyStats, "Window: day 2026-04-14 (Asia/Shanghai)\nNo events found for the selected window.");
  assert.equal(emptySummary, "Window: day 2026-04-14 (Asia/Shanghai)\nNo events found for the selected window.");
});

test("default human output explains implicit day selection", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-e2e-default-window-"));
  const dbPath = path.join(tempHome, "urn.db");
  const env = {
    ...process.env,
    HOME: tempHome,
    URN_DB_PATH: dbPath,
    TZ: "UTC",
  };

  const queryOutput = execFileSync("node", [CLI_PATH, "query", "--timezone", "UTC"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  });
  const statsOutput = execFileSync("node", [CLI_PATH, "stats", "--timezone", "UTC"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  });
  const summaryOutput = execFileSync("node", [CLI_PATH, "summary", "--timezone", "UTC"], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf-8",
  });

  assert.match(queryOutput, /^Window: day \d{4}-\d{2}-\d{2} \(UTC, defaulted to today\)/);
  assert.match(statsOutput, /^Window: day \d{4}-\d{2}-\d{2} \(UTC, defaulted to today\)/);
  assert.match(summaryOutput, /^Window: day \d{4}-\d{2}-\d{2} \(UTC, defaulted to today\)/);
});

test("bin wrapper shows help output", () => {
  const helpOutput = execFileSync("node", [path.join(PROJECT_ROOT, "src", "bin", "urn.js"), "-h"], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: "utf-8",
  });

  assert.match(helpOutput, /Usage: urn/);
  assert.match(helpOutput, /Commands:/);
  assert.match(helpOutput, /query \[options\]/);
});
