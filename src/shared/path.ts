import os from "node:os";
import path from "node:path";

export function homeDir(): string {
  return os.homedir();
}

export function resolveDefaultDbPath(): string {
  return process.env.URN_DB_PATH || path.join(homeDir(), ".urn", "urn.db");
}

export function resolveNodeId(): string {
  return process.env.URN_NODE_ID || `local:${os.hostname()}`;
}
