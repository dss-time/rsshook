import { writeTextToClipboard } from '../../shared/clipboard';

/**
 * Cell value supported by copyTableToClipboard.
 */
export type TableCellValue = string | number | boolean | null | undefined;

/**
 * Options for copying table data to clipboard.
 */
export interface CopyTableToClipboardOptions {
  /**
   * Separator used between rows.
   *
   * @default "\n"
   */
  lineSeparator?: string;
  /**
   * Separator used between columns.
   *
   * @default "\t"
   */
  columnSeparator?: string;
}

const sanitizeCellValue = (value: TableCellValue) => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/[\t\r\n]+/g, ' ');
};

/**
 * Copy a two-dimensional array as an Excel-friendly table string.
 *
 * @param table Two-dimensional table data.
 * @param options Copy options.
 * @returns Whether the copy operation succeeded.
 */
export async function copyTableToClipboard(
  table: TableCellValue[][],
  options: CopyTableToClipboardOptions = {}
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  const { lineSeparator = '\n', columnSeparator = '\t' } = options;
  const text = table
    .map(row => row.map(sanitizeCellValue).join(columnSeparator))
    .join(lineSeparator);

  return writeTextToClipboard(text);
}

/**
 * @example
 * await copyTableToClipboard([
 *   ['姓名', '年龄'],
 *   ['张三', 20],
 *   ['李四', 21],
 * ]);
 */
