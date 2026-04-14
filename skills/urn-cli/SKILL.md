---
name: urn-cli
description: Use when Codex needs to inspect, query, validate, or explain local work activity with the `urn` CLI, especially for commands such as `urn query`, `urn stats`, `urn summary`, `urn ingest`, `urn sync`, `urn sources list`, and `urn nodes list`. Use for debugging CLI behavior, checking indexed activity windows, exporting records, and choosing the right output format for human-readable or machine-readable results.
---

# URN CLI

Use the globally available `urn` command.

Do not run the CLI from the project directory with `node dist/cli/index.js`, `pnpm cli`, or other repo-local entrypoints unless the user explicitly asks to test the local checkout. The default assumption is that the task is about the installed `urn` command.

## Core Rules

- Run `urn ...`, not `node dist/cli/index.js ...`.
- Treat default output as human-oriented. If the result needs to be parsed, diffed, piped, or inspected precisely, add `--format`.
- Assume `query`, `stats`, and `summary` default to a day window when the user does not pass `--day`, `--start/--end`, or `--recent`. Read and mention the printed `Window:` line.
- Prefer explicit time windows in analysis and reporting so the user knows whether the result is for today, a fixed day, a range, or a recent window.

## Format Selection

Choose `--format` deliberately.

- Use `--format json` when another agent or script needs stable structured data.
- Use `--format jsonl` for record-by-record streaming output from `urn query`.
- Use `--format csv` when the user wants spreadsheet-style export of query rows.
- Use `--format tsv` when shell text tools are the next step and tab-separated rows are more convenient than CSV.
- Use the default `table` or `text` output when the goal is human inspection in the terminal.

Do not rely on human-friendly `table` or `text` output for programmatic parsing.

## Command Patterns

Use these patterns as the default starting point.

### Inspect indexed events

```bash
urn query --day 2026-04-14
urn query --recent 7d --format json
urn query --source shell_history --day 2026-04-14 --format csv
```

### Inspect aggregates

```bash
urn stats --day 2026-04-14
urn stats --recent 30d --format json
urn summary --day 2026-04-14
urn summary --start 2026-04-11T00:00:00 --end 2026-04-12T23:59:59 --format json
```

### Run ingestion or sync

```bash
urn ingest --profile daily
urn ingest --profile daily --include-shell --format json
urn sync
urn sync --format json
```

### Inspect built-in metadata

```bash
urn sources list
urn nodes list
urn nodes list --format json
```

## Reporting Guidance

- When you show command results to the user, mention the effective window and any explicit filters you used.
- If you used a structured format, summarize the key findings instead of dumping raw JSON unless the user asked for the raw output.
- If the user appears confused by a default window, spell out the exact day or range in your response.
