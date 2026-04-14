import { redactText, redactUnknown } from "../../shared/redact-rules.js";

export function redactContent(content: string): string {
  return redactText(content);
}

export function redactPayload(payload: unknown): unknown {
  return redactUnknown(payload);
}
