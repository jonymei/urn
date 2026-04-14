import { Command } from "commander";
import { openDatabase } from "../../core/storage/db.js";
import { IngestPipeline } from "../../core/ingest/pipeline.js";
import { createRegistry, parseWindowFromOptions } from "../index.js";
import { resolveNodeId } from "../../shared/path.js";

export function createIngestCommand(): Command {
  return new Command("ingest")
    .description("Fetch source data and ingest into local storage")
    .option("--source <id>", "Source id or all", "all")
    .option("--day <date>", "Target day in YYYY-MM-DD")
    .option("--start <datetime>", "Range start")
    .option("--end <datetime>", "Range end")
    .option("--recent <value>", "Recent window, for example 12h or 7d")
    .option("--timezone <tz>", "Timezone label", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .action((options) => {
      const window = parseWindowFromOptions(options);
      const db = openDatabase();
      const registry = createRegistry();
      const pipeline = new IngestPipeline(db, resolveNodeId());
      const result = pipeline.run(registry.resolveMany(options.source), window);
      console.log(JSON.stringify(result, null, 2));
      db.close();
    });
}
