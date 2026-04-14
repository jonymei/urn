import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { EventRepo } from "../../core/storage/event-repo.js";
import { EventQueryService } from "../../core/query/event-query-service.js";
import { renderEmptyState, renderJson, renderTable } from "../output.js";
import { describeWindow, parseWindowFromOptions, windowToFilter } from "../index.js";

export function createStatsCommand(): Command {
  return new Command("stats")
    .description("Show aggregate event statistics")
    .option("--source <type>", "Source type or all", "all")
    .option("--app <name>", "Source app or all", "all")
    .option("--day <date>", "Target day in YYYY-MM-DD")
    .option("--start <datetime>", "Range start")
    .option("--end <datetime>", "Range end")
    .option("--recent <value>", "Recent window, for example 12h or 7d")
    .option("--timezone <tz>", "Timezone label", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .option("--format <format>", "Output format: table, json", "table")
    .action((options) => {
      const db = openDatabase();
      const window = parseWindowFromOptions(options);
      const service = new EventQueryService(new EventRepo(db));
      const stats = service.stats({
        ...windowToFilter(window),
        sourceType: options.source,
        sourceApp: options.app,
      });
      if (options.format === "json") {
        console.log(renderJson(stats));
      } else if (options.format === "table") {
        if (stats.totalEvents === 0) {
          console.log([
            `Window: ${describeWindow(window, options)}`,
            renderEmptyState("No events found for the selected window."),
          ].join("\n"));
          db.close();
          return;
        }
        const sections = [
          `Window: ${describeWindow(window, options)}`,
          "",
          "Totals",
          renderTable({
            columns: [
              { key: "label", header: "Metric", maxWidth: 18, required: true },
              { key: "value", header: "Value", align: "right", maxWidth: 12 },
            ],
            rows: [
              { label: "Events", value: stats.totalEvents },
              { label: "Raw Records", value: stats.totalRawRecords },
            ],
          }),
          "",
          "By Source App",
          renderTable({
            columns: [
              { key: "key", header: "App", maxWidth: 20, required: true },
              { key: "count", header: "Count", align: "right", maxWidth: 12 },
            ],
            rows: stats.bySourceApp,
          }),
          "",
          "By Source Type",
          renderTable({
            columns: [
              { key: "key", header: "Source Type", maxWidth: 20, required: true },
              { key: "count", header: "Count", align: "right", maxWidth: 12 },
            ],
            rows: stats.bySourceType,
          }),
          "",
          "By Day",
          renderTable({
            columns: [
              { key: "key", header: "Day", maxWidth: 12, required: true },
              { key: "count", header: "Count", align: "right", maxWidth: 12 },
            ],
            rows: stats.byDay,
          }),
        ];
        console.log(sections.join("\n"));
      } else {
        throw new Error(`Unknown format: ${options.format}`);
      }
      db.close();
    });
}
