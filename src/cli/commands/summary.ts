import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { EventRepo } from "../../core/storage/event-repo.js";
import { EventQueryService } from "../../core/query/event-query-service.js";
import { renderEmptyState, renderJson, renderTable } from "../output.js";
import { describeWindow, parseWindowFromOptions, windowToFilter } from "../index.js";

function truncate(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function createSummaryCommand(): Command {
  return new Command("summary")
    .description("Summarize indexed activity in a time window")
    .option("--source <type>", "Source type or all", "all")
    .option("--app <name>", "Source app or all", "all")
    .option("--day <date>", "Target day in YYYY-MM-DD")
    .option("--start <datetime>", "Range start")
    .option("--end <datetime>", "Range end")
    .option("--recent <value>", "Recent window, for example 12h or 7d")
    .option("--timezone <tz>", "Timezone label", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .option("--limit <n>", "Representative event count", "8")
    .option("--format <format>", "Output format: text, json", "text")
    .action((options) => {
      const db = openDatabase();
      const service = new EventQueryService(new EventRepo(db));
      const window = parseWindowFromOptions(options);
      const filter = {
        ...windowToFilter(window),
        sourceType: options.source,
        sourceApp: options.app,
      };
      const stats = service.stats(filter);
      const events = service.query({
        ...filter,
        limit: 500,
      });

      const cwdCounts = new Map<string, number>();
      const titleCounts = new Map<string, number>();
      for (const event of events) {
        if (event.cwd) {
          cwdCounts.set(event.cwd, (cwdCounts.get(event.cwd) || 0) + 1);
        }
        if (event.title) {
          titleCounts.set(event.title, (titleCounts.get(event.title) || 0) + 1);
        }
      }

      const topCwds = Array.from(cwdCounts.entries())
        .map(([cwd, count]) => ({ cwd, count }))
        .sort((a, b) => b.count - a.count || a.cwd.localeCompare(b.cwd))
        .slice(0, 5);

      const topTitles = Array.from(titleCounts.entries())
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
        .slice(0, 8);

      const representativeEvents = events
        .filter((event) => event.actor === "user" || event.actor === "agent")
        .filter((event) => event.contentRedacted.trim())
        .slice(0, Number(options.limit))
        .map((event) => ({
          occurredAt: event.occurredAt,
          sourceApp: event.sourceApp,
          cwd: event.cwd,
          title: event.title,
          content: truncate(event.contentRedacted),
        }));

      const summary = {
        window: filter,
        totals: {
          events: stats.totalEvents,
          rawRecords: stats.totalRawRecords,
        },
        bySourceApp: stats.bySourceApp,
        topCwds,
        topTitles,
        representativeEvents,
      };

      if (options.format === "json") {
        console.log(renderJson(summary));
      } else if (options.format === "text") {
        if (stats.totalEvents === 0) {
          console.log([
            `Window: ${describeWindow(window, options)}`,
            renderEmptyState("No events found for the selected window."),
          ].join("\n"));
          db.close();
          return;
        }
        const lines = [
          `Window: ${describeWindow(window, options)}`,
          `Events: ${stats.totalEvents}`,
          `Raw Records: ${stats.totalRawRecords}`,
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
          "Top CWDs",
          renderTable({
            columns: [
              { key: "cwd", header: "CWD", maxWidth: 48, minWidth: 12, required: true },
              { key: "count", header: "Count", align: "right", maxWidth: 12 },
            ],
            rows: topCwds,
            emptyMessage: "No directories found.",
          }),
          "",
          "Top Titles",
          renderTable({
            columns: [
              { key: "title", header: "Title", maxWidth: 48, minWidth: 12, required: true },
              { key: "count", header: "Count", align: "right", maxWidth: 12 },
            ],
            rows: topTitles,
            emptyMessage: "No titles found.",
          }),
          "",
          "Representative Events",
          renderTable({
            columns: [
              { key: "occurredAt", header: "Time", maxWidth: 24, minWidth: 19, required: true },
              { key: "sourceApp", header: "App", maxWidth: 16, minWidth: 6, required: true },
              { key: "cwd", header: "CWD", maxWidth: 28, minWidth: 8, priority: 3 },
              { key: "title", header: "Title", maxWidth: 28, minWidth: 8, priority: 2 },
              { key: "content", header: "Content", maxWidth: 48, minWidth: 12, priority: 1, required: true },
            ],
            rows: representativeEvents,
            emptyMessage: "No representative events found.",
          }),
        ];
        console.log(lines.join("\n"));
      } else {
        throw new Error(`Unknown format: ${options.format}`);
      }
      db.close();
    });
}
