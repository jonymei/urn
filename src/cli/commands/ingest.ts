import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { IngestPipeline } from "../../core/ingest/pipeline.js";
import { createRegistry, parseWindowFromOptions } from "../index.js";
import { resolveNodeId } from "../../shared/path.js";
import type { SourceFetcher } from "../../core/types/fetch.js";
import type { FetchWindow } from "../../core/types/query.js";
import { getWindowBounds } from "../../shared/time.js";
import { renderEmptyState, renderJson, renderTable } from "../output.js";

interface IngestBatchSummary {
  label: string;
  sourceIds: string[];
  window: FetchWindow;
  result: {
    rawRecordsRead: number;
    rawRecordsInserted: number;
    eventsInserted: number;
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function sumResults(items: IngestBatchSummary[]) {
  return items.reduce((acc, item) => ({
    rawRecordsRead: acc.rawRecordsRead + item.result.rawRecordsRead,
    rawRecordsInserted: acc.rawRecordsInserted + item.result.rawRecordsInserted,
    eventsInserted: acc.eventsInserted + item.result.eventsInserted,
  }), {
    rawRecordsRead: 0,
    rawRecordsInserted: 0,
    eventsInserted: 0,
  });
}

function runBatch(
  pipeline: IngestPipeline,
  fetchers: SourceFetcher[],
  label: string,
  window: FetchWindow,
): IngestBatchSummary {
  return {
    label,
    sourceIds: fetchers.map((fetcher) => fetcher.definition.id),
    window,
    result: pipeline.run(fetchers, window),
  };
}

function createDailyProfile(
  registry: ReturnType<typeof createRegistry>,
  timezone: string,
  day: string,
  includeShell: boolean,
): Array<{ label: string; fetchers: SourceFetcher[]; window: FetchWindow }> {
  const dayWindow: FetchWindow = { kind: "day", date: day, timezone };
  const browserWindow: FetchWindow = {
    kind: "range",
    start: `${addDays(day, -2)}T00:00:00`,
    end: `${day}T23:59:59.999`,
    timezone,
  };
  const allFetchers = registry.list();
  const groups: Array<{ label: string; fetchers: SourceFetcher[]; window: FetchWindow }> = [
    {
      label: "agent-sessions",
      fetchers: allFetchers.filter((fetcher) => fetcher.definition.type === "agent_session"),
      window: dayWindow,
    },
    {
      label: "browser-history",
      fetchers: allFetchers.filter((fetcher) => fetcher.definition.type === "browser_history"),
      window: browserWindow,
    },
  ];

  if (includeShell) {
    groups.push({
      label: "shell-history",
      fetchers: allFetchers.filter((fetcher) => fetcher.definition.type === "shell_history"),
      window: dayWindow,
    });
  }

  return groups.filter((group) => group.fetchers.length > 0);
}

export function createIngestCommand(): Command {
  return new Command("ingest")
    .description("Fetch source data and ingest into local storage")
    .option("--source <id>", "Source id or all", "all")
    .option("--profile <name>", "Ingest profile: daily")
    .option("--day <date>", "Target day in YYYY-MM-DD")
    .option("--start <datetime>", "Range start")
    .option("--end <datetime>", "Range end")
    .option("--recent <value>", "Recent window, for example 12h or 7d")
    .option("--timezone <tz>", "Timezone label", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .option("--include-shell", "Include shell history in profile runs", false)
    .option("--format <format>", "Output format: text, json", "text")
    .action((options) => {
      const db = openDatabase();
      const registry = createRegistry();
      const pipeline = new IngestPipeline(db, resolveNodeId());
      const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (options.profile) {
        if (options.profile !== "daily") {
          throw new Error(`Unknown ingest profile: ${options.profile}`);
        }
        if (options.source !== "all") {
          throw new Error("--source cannot be combined with --profile");
        }
        if (options.start || options.end || options.recent) {
          throw new Error("--profile only supports --day and --timezone");
        }
        const day = options.day || new Date().toISOString().slice(0, 10);
        const batches = createDailyProfile(registry, timezone, day, Boolean(options.includeShell))
          .map((batch) => runBatch(pipeline, batch.fetchers, batch.label, batch.window));

        const output = {
          profile: "daily",
          day,
          timezone,
          batches: batches.map((batch) => ({
            ...batch,
            window: {
              ...batch.window,
              bounds: getWindowBounds(batch.window),
            },
          })),
          totals: sumResults(batches),
        };
        if (options.format === "json") {
          console.log(renderJson(output));
        } else if (options.format === "text") {
          if (batches.length === 0) {
            console.log(renderEmptyState("No batches available for this ingest run."));
            db.close();
            return;
          }
          console.log([
            `Profile: daily`,
            `Day: ${day}`,
            `Timezone: ${timezone}`,
            "",
            renderTable({
              columns: [
                { key: "label", header: "Batch", maxWidth: 20, minWidth: 8, required: true },
                { key: "mode", header: "Window", maxWidth: 36, minWidth: 12, priority: 1 },
                { key: "rawRecordsRead", header: "Read", align: "right", maxWidth: 10 },
                { key: "rawRecordsInserted", header: "Raw+", align: "right", maxWidth: 10 },
                { key: "eventsInserted", header: "Events+", align: "right", maxWidth: 10 },
              ],
              rows: batches.map((batch) => ({
                label: batch.label,
                mode: batch.window.kind === "day"
                  ? `${batch.window.date} (${batch.window.timezone})`
                  : batch.window.kind === "recent"
                    ? `recent ${batch.window.amount} ${batch.window.unit}`
                    : `${batch.window.start} -> ${batch.window.end}`,
                rawRecordsRead: batch.result.rawRecordsRead,
                rawRecordsInserted: batch.result.rawRecordsInserted,
                eventsInserted: batch.result.eventsInserted,
              })),
            }),
            "",
            `Totals: read=${output.totals.rawRecordsRead} raw+=${output.totals.rawRecordsInserted} events+=${output.totals.eventsInserted}`,
          ].join("\n"));
        } else {
          throw new Error(`Unknown format: ${options.format}`);
        }
        db.close();
        return;
      }

      const window = parseWindowFromOptions(options);
      const result = pipeline.run(registry.resolveMany(options.source), window);
      const output = {
        ...result,
        window: {
          ...window,
          bounds: getWindowBounds(window),
        },
      };
      if (options.format === "json") {
        console.log(renderJson(output));
      } else if (options.format === "text") {
        const windowLabel = window.kind === "day"
          ? `${window.date} (${window.timezone})`
          : window.kind === "recent"
            ? `recent ${window.amount} ${window.unit} (${window.timezone})`
            : `${window.start} -> ${window.end}`;
        console.log([
          `Ingest complete`,
          `Window: ${windowLabel}`,
          renderTable({
            columns: [
              { key: "label", header: "Metric", maxWidth: 20, required: true },
              { key: "value", header: "Value", align: "right", maxWidth: 12 },
            ],
            rows: [
              { label: "Raw Records Read", value: output.rawRecordsRead },
              { label: "Raw Records Added", value: output.rawRecordsInserted },
              { label: "Events Added", value: output.eventsInserted },
            ],
          }),
        ].join("\n"));
      } else {
        throw new Error(`Unknown format: ${options.format}`);
      }
      db.close();
    });
}
