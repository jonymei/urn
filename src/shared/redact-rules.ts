const RULES = [
  /sk-[a-zA-Z0-9]{16,}/g,
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?<=\b(?:api[_-]?key|token|secret|password)\b["'\s:=]{0,10})[A-Za-z0-9\-._~+/=]{6,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9_\-]{32,}\b/g,
];

export function redactText(input: string): string {
  return RULES.reduce((value, rule) => value.replace(rule, "****"), input);
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactUnknown);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactUnknown(nested);
    }
    return result;
  }
  return value;
}
