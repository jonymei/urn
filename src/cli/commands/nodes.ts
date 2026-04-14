import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { resolveNodeId } from "../../shared/path.js";

export function createNodesCommand(): Command {
  const command = new Command("nodes").description("List known nodes");
  command.command("list").action(() => {
    const db = openDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO nodes (id, name, kind)
      VALUES (?, ?, 'local')
    `).run(resolveNodeId(), resolveNodeId());
    const rows = db.prepare("SELECT id, name, kind FROM nodes ORDER BY id ASC").all();
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
  return command;
}
