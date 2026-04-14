import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDefaultDbPath } from "../../shared/path.js";
import { runMigrations } from "./migrations.js";

export function openDatabase(dbPath = resolveDefaultDbPath()): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  runMigrations(db);
  return db;
}
