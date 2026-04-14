import test from "node:test";
import assert from "node:assert/strict";
import { redactText } from "../../dist/shared/redact-rules.js";

test("redactText masks common secrets", () => {
  const input = "token=sk-1234567890abcdefghijkl bearer Bearer abcdefghijklmnopqrstuvwxyz123456";
  const output = redactText(input);
  assert.equal(output.includes("sk-1234567890abcdefghijkl"), false);
  assert.equal(output.includes("Bearer abcdef"), false);
  assert.match(output, /\*\*\*\*/);
});
