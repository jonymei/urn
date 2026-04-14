import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { IngestPipeline } from "../../core/ingest/pipeline.js";
import { createRegistry } from "../index.js";
import { resolveNodeId } from "../../shared/path.js";
import { CursorRepo } from "../../core/storage/cursor-repo.js";
import type { FetchWindow } from "../../core/types/query.js";
import type { SourceFetcher } from "../../core/types/fetch.js";
import { getWindowBounds } from "../../shared/time.js";

interface SyncBatchSummary {
  label: string;
  sourceIds: string[];
  mode: "cursor" | "window";
  result: {
    rawRecordsRead: number;
    rawRecordsInserted: number;
    eventsInserted: number;
  };
  window?: FetchWindow;
}

function sumResults(items: SyncBatchSummary[]) {
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

function byType(fetchers: SourceFetcher[], type: SourceFetcher["definition"]["type"]): SourceFetcher[] {
  return fetchers.filter((fetcher) => fetcher.definition.type === type);
}

export function createSyncCommand(): Command {
  return new Command("sync")
    .description("Incremental sync optimized for frequent runs")
    .option("--profile <name>", "Sync profile: hourly", "hourly")
    .option("--timezone <tz>", "Timezone label", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .option("--agent-overlap-hours <n>", "Replay overlap for agent sessions", "0.25")
    .option("--browser-days <n>", "Replay window for browser history", "1")
    .option("--include-shell", "Include shell history replay", false)
    .option("--shell-hours <n>", "Replay window for shell history", "24")
    .action((options) => {
      if (options.profile !== "hourly") {
        throw new Error(`Unknown sync profile: ${options.profile}`);
      }

      const db = openDatabase();
      const registry = createRegistry();
      const nodeId = resolveNodeId();
      const pipeline = new IngestPipeline(db, nodeId);
      const cursorRepo = new CursorRepo(db);
      const fetchers = registry.list();
      const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const batches: SyncBatchSummary[] = [];

      const overlapMs = Number(options.agentOverlapHours) * 60 * 60 * 1000;
      for (const fetcher of byType(fetchers, "agent_session")) {
        const syncResult = fetcher.sync
          ? fetcher.sync({
              nodeId,
              fetchedAt: new Date().toISOString(),
              cursor: cursorRepo.get(fetcher.definition.id) || undefined,
              overlapMs,
            })
          : { records: fetcher.fetch({ kind: "recent", amount: 2, unit: "hours", timezone }, {
              nodeId,
              fetchedAt: new Date().toISOString(),
            }) };
        const result = pipeline.ingestRawRecords(syncResult.records);
        if (syncResult.nextCursor) {
          cursorRepo.put(fetcher.definition.id, syncResult.nextCursor);
        }
        batches.push({
          label: fetcher.definition.id,
          sourceIds: [fetcher.definition.id],
          mode: "cursor",
          result,
        });
      }

      const browserWindow: FetchWindow = {
        kind: "recent",
        amount: Number(options.browserDays),
        unit: "days",
        timezone,
      };
      const browserFetchers = byType(fetchers, "browser_history");
      if (browserFetchers.length > 0) {
        batches.push({
          label: "browser-history",
          sourceIds: browserFetchers.map((fetcher) => fetcher.definition.id),
          mode: "window",
          window: browserWindow,
          result: pipeline.run(browserFetchers, browserWindow),
        });
      }

      if (options.includeShell) {
        const shellWindow: FetchWindow = {
          kind: "recent",
          amount: Number(options.shellHours),
          unit: "hours",
          timezone,
        };
        const shellFetchers = byType(fetchers, "shell_history");
        if (shellFetchers.length > 0) {
          batches.push({
            label: "shell-history",
            sourceIds: shellFetchers.map((fetcher) => fetcher.definition.id),
            mode: "window",
            window: shellWindow,
            result: pipeline.run(shellFetchers, shellWindow),
          });
        }
      }

      console.log(JSON.stringify({
        profile: "hourly",
        timezone,
        batches: batches.map((batch) => ({
          ...batch,
          window: batch.window
            ? {
                ...batch.window,
                bounds: getWindowBounds(batch.window),
              }
            : undefined,
        })),
        totals: sumResults(batches),
      }, null, 2));
      db.close();
    });
}
