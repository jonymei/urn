import { createHash } from "node:crypto";

export function stableHash(...values: Array<string | null | undefined>): string {
  const hash = createHash("sha256");
  for (const value of values) {
    hash.update(value ?? "");
    hash.update("\u001f");
  }
  return hash.digest("hex");
}
