import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { resolveNodeId } from "../../shared/path.js";
import { renderEmptyState, renderJson, renderTable } from "../output.js";

export function createNodesCommand(): Command {
  const command = new Command("nodes").description("List known nodes");
  command.command("list").option("--format <format>", "Output format: table, json", "table").action((options) => {
    const db = openDatabase();
    db.prepare(`
      INSERT OR IGNORE INTO nodes (id, name, kind)
      VALUES (?, ?, 'local')
    `).run(resolveNodeId(), resolveNodeId());
    const rows = db.prepare("SELECT id, name, kind FROM nodes ORDER BY id ASC").all();
    if (options.format === "json") {
      console.log(renderJson(rows));
    } else if (options.format === "table") {
      if (rows.length === 0) {
        console.log(renderEmptyState("No nodes available."));
        db.close();
        return;
      }
      console.log(renderTable({
        columns: [
          { key: "id", header: "ID", maxWidth: 32, minWidth: 10, required: true },
          { key: "name", header: "Name", maxWidth: 24, minWidth: 8, required: true },
          { key: "kind", header: "Kind", maxWidth: 12, minWidth: 6, priority: 1 },
        ],
        rows,
      }));
    } else {
      throw new Error(`Unknown format: ${options.format}`);
    }
    db.close();
  });
  return command;
}
