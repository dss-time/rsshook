/**
 * Error messages associated with an original Excel row number.
 */
export interface ExcelRowError {
  /**
   * Original Excel row number.
   */
  rowNumber: number;
  /**
   * Error message or error message list for the row.
   */
  messages: string[] | string;
}

/**
 * Options for appending an Excel error column.
 */
export interface AppendExcelErrorColumnOptions {
  /**
   * Name of the appended error column.
   *
   * @default "错误原因"
   */
  errorColumnName?: string;
  /**
   * Separator used when multiple error messages are joined.
   *
   * @default "；"
   */
  joiner?: string;
  /**
   * Field name that stores the original Excel row number.
   *
   * @default "__rowNumber"
   */
  rowNumberKey?: string;
  /**
   * Remove the internal row number field from returned rows.
   *
   * @default true
   */
  removeRowNumber?: boolean;
}

const DEFAULT_ERROR_COLUMN_NAME = '错误原因';
const DEFAULT_JOINER = '；';
const DEFAULT_ROW_NUMBER_KEY = '__rowNumber';

const toMessageList = (messages: string[] | string) =>
  Array.isArray(messages) ? messages : [messages];

/**
 * Append an error reason column to Excel rows by matching original row numbers.
 *
 * This is commonly used after validating imported Excel data, so invalid rows
 * can be exported back to users with a readable error reason column.
 *
 * @template T Source row type.
 * @param rows Rows that may contain an internal row number field.
 * @param errors Error messages grouped by original Excel row number.
 * @param options Append options.
 * @returns New rows with an appended error column.
 */
export function appendExcelErrorColumn<T extends Record<string, unknown>>(
  rows: T[],
  errors: ExcelRowError[],
  options: AppendExcelErrorColumnOptions = {}
): Array<T & Record<string, unknown>> {
  const {
    errorColumnName = DEFAULT_ERROR_COLUMN_NAME,
    joiner = DEFAULT_JOINER,
    rowNumberKey = DEFAULT_ROW_NUMBER_KEY,
    removeRowNumber = true,
  } = options;

  const errorMap = errors.reduce<Map<number, string[]>>((map, error) => {
    const messages = toMessageList(error.messages).filter(Boolean);
    const currentMessages = map.get(error.rowNumber) || [];
    map.set(error.rowNumber, currentMessages.concat(messages));
    return map;
  }, new Map<number, string[]>());

  return rows.map(row => {
    const nextRow: Record<string, unknown> = { ...row };
    const rowNumber = Number(nextRow[rowNumberKey]);
    const messages = errorMap.get(rowNumber) || [];

    nextRow[errorColumnName] = messages.join(joiner);

    if (removeRowNumber) {
      delete nextRow[rowNumberKey];
    }

    return nextRow as T & Record<string, unknown>;
  });
}

/**
 * @example
 * const result = appendExcelErrorColumn(
 *   [
 *     {
 *       name: '张三',
 *       phone: '13800000000',
 *       __rowNumber: 2,
 *     },
 *     {
 *       name: '李四',
 *       phone: '',
 *       __rowNumber: 3,
 *     },
 *   ],
 *   [
 *     {
 *       rowNumber: 3,
 *       messages: ['手机号不能为空', '手机号格式错误'],
 *     },
 *   ]
 * );
 *
 * // [
 * //   {
 * //     name: '张三',
 * //     phone: '13800000000',
 * //     错误原因: '',
 * //   },
 * //   {
 * //     name: '李四',
 * //     phone: '',
 * //     错误原因: '手机号不能为空；手机号格式错误',
 * //   },
 * // ]
 */
