import test from "node:test";
import assert from "node:assert/strict";
import { describeWindow, parseWindowFromOptions } from "../../dist/cli/index.js";
import { getDateInTimezone } from "../../dist/shared/time.js";

test("getDateInTimezone formats current date in the requested timezone", () => {
  const now = new Date("2026-04-14T23:30:00.000Z");
  assert.equal(getDateInTimezone("UTC", now), "2026-04-14");
  assert.equal(getDateInTimezone("Asia/Shanghai", now), "2026-04-15");
  assert.equal(getDateInTimezone("America/Los_Angeles", now), "2026-04-14");
});

test("parseWindowFromOptions defaults to a timezone-local day", () => {
  const window = parseWindowFromOptions({
    timezone: "Asia/Shanghai",
  });
  assert.equal(window.kind, "day");
  assert.match(window.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("describeWindow marks implicit today defaults", () => {
  const implicit = describeWindow(
    { kind: "day", date: "2026-04-14", timezone: "Asia/Shanghai" },
    {},
  );
  const explicit = describeWindow(
    { kind: "day", date: "2026-04-14", timezone: "Asia/Shanghai" },
    { day: "2026-04-14" },
  );

  assert.equal(implicit, "day 2026-04-14 (Asia/Shanghai, defaulted to today)");
  assert.equal(explicit, "day 2026-04-14 (Asia/Shanghai)");
});
