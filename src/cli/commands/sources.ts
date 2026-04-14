import { Command } from "commander";
import { createRegistry } from "../index.js";
import { renderEmptyState, renderJson, renderTable } from "../output.js";

export function createSourcesCommand(): Command {
  const command = new Command("sources").description("List built-in sources");
  command
    .command("list")
    .option("--format <format>", "Output format: table, json", "table")
    .action((options) => {
      const registry = createRegistry();
      const definitions = registry.list().map((fetcher) => fetcher.definition);
      if (options.format === "json") {
        console.log(renderJson(definitions));
      } else if (options.format === "table") {
        if (definitions.length === 0) {
          console.log(renderEmptyState("No sources available."));
          return;
        }
        console.log(renderTable({
          columns: [
            { key: "id", header: "ID", maxWidth: 28, minWidth: 10, required: true },
            { key: "type", header: "Type", maxWidth: 20, minWidth: 10, priority: 2 },
            { key: "app", header: "App", maxWidth: 16, minWidth: 6, required: true },
            { key: "title", header: "Title", maxWidth: 32, minWidth: 10, priority: 1 },
          ],
          rows: definitions,
        }));
      } else {
        throw new Error(`Unknown format: ${options.format}`);
      }
    });
  return command;
}
