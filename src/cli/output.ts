export interface TableColumn<Row> {
  key: keyof Row | string;
  header: string;
  align?: "left" | "right";
  maxWidth?: number;
  minWidth?: number;
  priority?: number;
  required?: boolean;
}

export interface TableOptions<Row> {
  columns: Array<TableColumn<Row>>;
  rows: Row[];
  maxWidth?: number;
  emptyMessage?: string;
}

const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function isCombiningCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const char of stripAnsi(value)) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || isCombiningCodePoint(codePoint)) {
      continue;
    }
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

export function normalizeInlineText(value: string | number | null | undefined): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

export function truncateDisplayWidth(value: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return "";
  }
  if (displayWidth(value) <= maxWidth) {
    return value;
  }
  if (maxWidth === 1) {
    return "…";
  }

  let width = 0;
  let output = "";
  for (const char of value) {
    const charWidth = displayWidth(char);
    if (width + charWidth > maxWidth - 1) {
      break;
    }
    output += char;
    width += charWidth;
  }
  return `${output}…`;
}

function padCell(value: string, width: number, align: "left" | "right"): string {
  const padding = Math.max(0, width - displayWidth(value));
  const spaces = " ".repeat(padding);
  return align === "right" ? `${spaces}${value}` : `${value}${spaces}`;
}

function getCellValue<Row>(row: Row, key: keyof Row | string): unknown {
  return (row as Record<string, unknown>)[String(key)];
}

export function renderEmptyState(message = "No results."): string {
  return message;
}

function resolveTerminalWidth(explicitWidth?: number): number {
  if (explicitWidth && explicitWidth > 0) {
    return explicitWidth;
  }
  const envWidth = Number(process.env.COLUMNS);
  if (Number.isFinite(envWidth) && envWidth > 0) {
    return envWidth;
  }
  if (process.stdout.columns && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  return 120;
}

function totalTableWidth(widths: number[]): number {
  if (widths.length === 0) {
    return 0;
  }
  return widths.reduce((sum, width) => sum + width, 0) + (widths.length - 1) * 2;
}

export function renderTable<Row>({ columns, rows, maxWidth, emptyMessage }: TableOptions<Row>): string {
  if (rows.length === 0) {
    return renderEmptyState(emptyMessage || "No rows.");
  }

  const terminalWidth = resolveTerminalWidth(maxWidth);
  const candidates = columns.map((column, index) => ({
    ...column,
    priority: column.priority ?? index,
    minWidth: column.minWidth ?? Math.min(Math.max(displayWidth(column.header), 4), column.maxWidth ?? Infinity),
  }));

  const rawRows = rows.map((row) =>
    candidates.map((column) => normalizeInlineText(getCellValue(row, column.key) as string | number | null | undefined)),
  );

  let active = candidates.map((_, index) => index);

  const computeWidths = (indexes: number[]) =>
    indexes.map((columnIndex) => {
      const column = candidates[columnIndex];
      const contentWidth = Math.max(
        displayWidth(column.header),
        ...rawRows.map((row) => displayWidth(row[columnIndex])),
      );
      return Math.min(contentWidth, column.maxWidth ?? contentWidth);
    });

  let widths = computeWidths(active);
  while (totalTableWidth(widths) > terminalWidth) {
    let adjusted = false;
    for (let index = widths.length - 1; index >= 0; index -= 1) {
      const column = candidates[active[index]];
      if (widths[index] > column.minWidth) {
        widths[index] -= 1;
        adjusted = true;
        if (totalTableWidth(widths) <= terminalWidth) {
          break;
        }
      }
    }
    if (adjusted) {
      continue;
    }

    const removable = active
      .map((columnIndex, index) => ({ columnIndex, index }))
      .filter(({ columnIndex }) => !candidates[columnIndex].required);
    if (removable.length === 0) {
      break;
    }
    removable.sort((a, b) => candidates[b.columnIndex].priority - candidates[a.columnIndex].priority);
    active.splice(removable[0].index, 1);
    widths = computeWidths(active);
  }

  const preparedRows = rawRows.map((row) =>
    active.map((columnIndex, index) => truncateDisplayWidth(row[columnIndex], widths[index])),
  );

  const header = active
    .map((columnIndex, index) => padCell(candidates[columnIndex].header, widths[index], candidates[columnIndex].align || "left"))
    .join("  ");
  const divider = active
    .map((_, index) => "-".repeat(widths[index]))
    .join("  ");
  const body = preparedRows.map((row) =>
    row
      .map((cell, index) => padCell(cell, widths[index], candidates[active[index]].align || "left"))
      .join("  "),
  );

  return [header, divider, ...body].join("\n");
}

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
