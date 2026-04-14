import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { EventRepo } from "../../core/storage/event-repo.js";
import { EventQueryService } from "../../core/query/event-query-service.js";
import { formatEventsCsv, formatEventsJsonl, formatEventsTable } from "../../core/query/export-service.js";
import { parseWindowFromOptions, windowToFilter } from "../index.js";

export function createQueryCommand(): Command {
  return new Command("query")
    .description("Query normalized events")
    .option("--source <type>", "Source type or all", "all")
    .option("--app <name>", "Source app or all", "all")
    .option("--day <date>", "Target day in YYYY-MM-DD")
    .option("--start <datetime>", "Range start")
    .option("--end <datetime>", "Range end")
    .option("--recent <value>", "Recent window, for example 12h or 7d")
    .option("--timezone <tz>", "Timezone label", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .option("--limit <n>", "Limit rows")
    .option("--format <format>", "Output format: table, json, jsonl, csv", "table")
    .action((options) => {
      const db = openDatabase();
      const eventRepo = new EventRepo(db);
      const service = new EventQueryService(eventRepo);
      const window = parseWindowFromOptions(options);
      const events = service.query({
        ...windowToFilter(window),
        sourceType: options.source,
        sourceApp: options.app,
        limit: options.limit ? Number(options.limit) : undefined,
      });
      switch (options.format) {
        case "json":
          console.log(JSON.stringify(events, null, 2));
          break;
        case "jsonl":
          console.log(formatEventsJsonl(events));
          break;
        case "csv":
          console.log(formatEventsCsv(events));
          break;
        case "table":
          console.log(formatEventsTable(events));
          break;
        default:
          throw new Error(`Unknown format: ${options.format}`);
      }
      db.close();
    });
}
