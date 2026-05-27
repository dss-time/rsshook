/**
 * Excel row object after parsing from a sheet.
 */
export type ExcelRow = Record<string, unknown>;

/**
 * Maps source Excel headers to normalized field names.
 *
 * @template T Normalized row type.
 */
export type HeaderMap<T extends ExcelRow = ExcelRow> = Record<
  string,
  keyof T | string
>;

/**
 * Options for normalizing parsed Excel rows.
 */
export interface NormalizeExcelRowsOptions {
  /**
   * Trim string values.
   *
   * @default true
   */
  trim?: boolean;
  /**
   * Remove rows where every normalized field is empty.
   *
   * @default true
   */
  removeEmptyRows?: boolean;
  /**
   * Keep fields that do not appear in the header map.
   *
   * @default false
   */
  keepUnmappedFields?: boolean;
  /**
   * Add the original Excel row number to each normalized row.
   *
   * @default true
   */
  keepRowNumber?: boolean;
  /**
   * Field name used for the original Excel row number.
   *
   * @default "__rowNumber"
   */
  rowNumberKey?: string;
  /**
   * Row number of the first data row. Usually 2 because row 1 is the header.
   *
   * @default 2
   */
  startRowNumber?: number;
}

const DEFAULT_ROW_NUMBER_KEY = '__rowNumber';

const hasOwn = (target: object, key: string) =>
  Object.prototype.hasOwnProperty.call(target, key);

const normalizeCellValue = (value: unknown, trim: boolean) => {
  if (typeof value !== 'string') return value;
  return trim ? value.trim() : value;
};

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === '';

/**
 * Normalize Excel rows by mapping source headers to target field names.
 *
 * This is useful after parsing an Excel sheet where headers are Chinese labels
 * or other display names, but application code expects stable field keys.
 *
 * @template T Normalized row type.
 * @param rows Parsed Excel rows.
 * @param headerMap Mapping from source header names to normalized field names.
 * @param options Normalization options.
 * @returns Normalized rows.
 */
export function normalizeExcelRows<T extends ExcelRow = ExcelRow>(
  rows: ExcelRow[],
  headerMap: HeaderMap<T>,
  options: NormalizeExcelRowsOptions = {}
): Array<T & ExcelRow> {
  const {
    trim = true,
    removeEmptyRows = true,
    keepUnmappedFields = false,
    keepRowNumber = true,
    rowNumberKey = DEFAULT_ROW_NUMBER_KEY,
    startRowNumber = 2,
  } = options;

  return rows.reduce<Array<T & ExcelRow>>((result, row, index) => {
    const normalizedRow: ExcelRow = {};

    Object.entries(row).forEach(([sourceKey, rawValue]) => {
      const value = normalizeCellValue(rawValue, trim);

      if (hasOwn(headerMap, sourceKey)) {
        const targetKey = String(headerMap[sourceKey]);
        normalizedRow[targetKey] = value;
        return;
      }

      if (keepUnmappedFields) {
        normalizedRow[sourceKey] = value;
      }
    });

    const isEmptyRow = Object.values(normalizedRow).every(isEmptyValue);
    if (removeEmptyRows && isEmptyRow) {
      return result;
    }

    if (keepRowNumber) {
      normalizedRow[rowNumberKey] = startRowNumber + index;
    }

    result.push(normalizedRow as T & ExcelRow);
    return result;
  }, []);
}

/**
 * @example
 * const rows = normalizeExcelRows(
 *   [
 *     {
 *       姓名: ' 张三 ',
 *       手机号: ' 13800000000 ',
 *       订单号: ' SO001 ',
 *     },
 *   ],
 *   {
 *     姓名: 'name',
 *     手机号: 'phone',
 *     订单号: 'orderNo',
 *   }
 * );
 *
 * // [
 * //   {
 * //     name: '张三',
 * //     phone: '13800000000',
 * //     orderNo: 'SO001',
 * //     __rowNumber: 2,
 * //   },
 * // ]
 */
