import test from "node:test";
import assert from "node:assert/strict";
import { displayWidth, renderEmptyState, renderTable, truncateDisplayWidth } from "../../dist/cli/output.js";

test("displayWidth treats CJK as wide characters", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("中文"), 4);
  assert.equal(displayWidth("A中B"), 4);
});

test("truncateDisplayWidth truncates by terminal width", () => {
  assert.equal(truncateDisplayWidth("中文命令行", 5), "中文…");
  assert.equal(truncateDisplayWidth("abcdef", 4), "abc…");
});

test("renderTable keeps aligned widths for CJK content", () => {
  const table = renderTable({
    columns: [
      { key: "name", header: "Name", maxWidth: 12 },
      { key: "title", header: "Title", maxWidth: 16 },
      { key: "count", header: "Count", align: "right", maxWidth: 8 },
    ],
    rows: [
      { name: "claude", title: "English title", count: 2 },
      { name: "中文节点", title: "处理中", count: 12 },
    ],
  });

  const lines = table.split("\n");
  const widths = lines.map((line) => displayWidth(line));
  assert.equal(new Set(widths).size, 1);
  assert.match(lines[3], /中文节点/);
  assert.match(lines[3], /处理中/);
});

test("renderTable drops low-priority columns on narrow terminals", () => {
  const table = renderTable({
    maxWidth: 28,
    columns: [
      { key: "time", header: "Time", minWidth: 8, required: true },
      { key: "app", header: "App", minWidth: 4, required: true },
      { key: "cwd", header: "CWD", minWidth: 8, priority: 3 },
      { key: "content", header: "Content", minWidth: 8, priority: 1, required: true },
    ],
    rows: [
      { time: "2026-04-13", app: "claude", cwd: "/Users/test/中文项目", content: "整理中文输出体验" },
    ],
  });

  assert.match(table, /Time/);
  assert.match(table, /App/);
  assert.match(table, /Content/);
  assert.doesNotMatch(table, /\bCWD\b/);
});

test("renderTable and empty state use consistent empty messages", () => {
  assert.equal(renderEmptyState("No events found."), "No events found.");
  assert.equal(renderTable({
    columns: [{ key: "name", header: "Name" }],
    rows: [],
    emptyMessage: "No rows here.",
  }), "No rows here.");
});
