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

const fallbackCopyText = (text: string) => {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof document.execCommand !== 'function' ||
    !document.body
  ) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
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

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to textarea copy below.
  }

  return fallbackCopyText(text);
}

/**
 * @example
 * await copyTableToClipboard([
 *   ['姓名', '年龄'],
 *   ['张三', 20],
 *   ['李四', 21],
 * ]);
 */
