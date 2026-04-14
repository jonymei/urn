import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("shell history ingest stores commands with nullable cwd", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "urn-shell-home-"));
  const dbPath = path.join(tempHome, "urn.db");
  fs.writeFileSync(
    path.join(tempHome, ".zsh_history"),
    ": 1776038400:0;git status\n: 1776038460:0;pnpm test\n",
  );

  execFileSync("node", ["dist/cli/index.js", "ingest", "--source", "zsh", "--day", "2026-04-13"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const output = execFileSync("node", ["dist/cli/index.js", "query", "--source", "shell_history", "--day", "2026-04-13", "--format", "json"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      URN_DB_PATH: dbPath,
    },
    encoding: "utf-8",
  });

  const rows = JSON.parse(output);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cwd, null);
  assert.equal(rows[0].contentRedacted, "git status");
});
