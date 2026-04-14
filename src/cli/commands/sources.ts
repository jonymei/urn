import { Command } from "commander";
import { createRegistry } from "../index.js";

export function createSourcesCommand(): Command {
  const command = new Command("sources").description("List built-in sources");
  command
    .command("list")
    .action(() => {
      const registry = createRegistry();
      console.log(JSON.stringify(
        registry.list().map((fetcher) => fetcher.definition),
        null,
        2,
      ));
    });
  return command;
}
