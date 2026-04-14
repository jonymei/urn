import { Command } from "commander";
import { createIngestCommand } from "./commands/ingest.js";
import { createNodesCommand } from "./commands/nodes.js";
import { createQueryCommand } from "./commands/query.js";
import { createSourcesCommand } from "./commands/sources.js";
import { createStatsCommand } from "./commands/stats.js";
import { createSummaryCommand } from "./commands/summary.js";
import { createSyncCommand } from "./commands/sync.js";
import { SourceRegistry } from "../core/source-registry/registry.js";
import type { FetchWindow, QueryFilter } from "../core/types/query.js";
import { parseRecent, getWindowBounds, toIsoString } from "../shared/time.js";
import { agentSessionFetchers } from "../sources/agent-sessions/index.js";
import { browserHistoryFetchers } from "../sources/browser-history/index.js";
import { shellHistoryFetchers } from "../sources/shell-history/index.js";

export function createRegistry(): SourceRegistry {
  return new SourceRegistry([
    ...agentSessionFetchers,
    ...browserHistoryFetchers,
    ...shellHistoryFetchers,
  ]);
}

export function parseWindowFromOptions(options: {
  day?: string;
  start?: string;
  end?: string;
  recent?: string;
  timezone?: string;
}): FetchWindow {
  const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (options.start || options.end) {
    if (!options.start || !options.end) {
      throw new Error("Both --start and --end are required");
    }
    return {
      kind: "range",
      start: options.start,
      end: options.end,
      timezone,
    };
  }
  if (options.recent) {
    const parsed = parseRecent(options.recent);
    return {
      kind: "recent",
      amount: parsed.amount,
      unit: parsed.unit,
      timezone,
    };
  }
  return {
    kind: "day",
    date: options.day || new Date().toISOString().slice(0, 10),
    timezone,
  };
}

export function windowToFilter(window: FetchWindow): QueryFilter {
  const bounds = getWindowBounds(window);
  return {
    start: toIsoString(bounds.start),
    end: toIsoString(bounds.end),
  };
}

const program = new Command();
program.name("urn").description("Collect and query local work activity");
program.addCommand(createIngestCommand());
program.addCommand(createSyncCommand());
program.addCommand(createQueryCommand());
program.addCommand(createStatsCommand());
program.addCommand(createSummaryCommand());
program.addCommand(createSourcesCommand());
program.addCommand(createNodesCommand());

try {
  program.parse();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
