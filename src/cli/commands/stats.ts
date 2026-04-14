import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { EventRepo } from "../../core/storage/event-repo.js";
import { EventQueryService } from "../../core/query/event-query-service.js";
import { parseWindowFromOptions, windowToFilter } from "../index.js";

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
    .action((options) => {
      const db = openDatabase();
      const service = new EventQueryService(new EventRepo(db));
      const stats = service.stats({
        ...windowToFilter(parseWindowFromOptions(options)),
        sourceType: options.source,
        sourceApp: options.app,
      });
      console.log(JSON.stringify(stats, null, 2));
      db.close();
    });
}
