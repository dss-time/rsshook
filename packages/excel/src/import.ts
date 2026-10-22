import type { CellObject, Range, WorkSheet } from 'xlsx';
import type {
  CellContext,
  ExcelInput,
  ExcelIssue,
  FieldRule,
  ParseOptions,
  ParseResult,
  ValidationResult,
} from './types';
import {
  ExcelError,
  asExcelError,
  checkAbort,
  config,
  phase,
  resolveLimits,
  rowIndex,
} from './errors';
import {
  abortable,
  columnIndex,
  columnName,
  loadEngine,
  readInput,
  ensureCodepages,
} from './engine';

const empty = (value: unknown) => value == null || value === '';
const ownSet = (object: object, key: string, value: unknown) =>
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
const issue = (
  code: string,
  message: string,
  context: CellContext
): ExcelIssue => ({
  code,
  message,
  rowNumber: context.rowNumber,
  column: context.column,
  field: context.field,
});
function validationIssues(
  value: ValidationResult,
  context?: CellContext
): ExcelIssue[] {
  if (value === undefined) return [];
  if (typeof value === 'string')
    return [
      {
        ...(context
          ? issue('VALIDATION_FAILED', value, context)
          : { code: 'VALIDATION_FAILED', message: value }),
      },
    ];
  const issues = Array.isArray(value) ? value : [value];
  config(
    issues.every(
      item =>
        item &&
        typeof item.code === 'string' &&
        typeof item.message === 'string'
    ),
    'Validators must return a string, issue, issue array or undefined'
  );
  return issues.map(item => ({
    ...(context
      ? {
          rowNumber: context.rowNumber,
          column: context.column,
          field: context.field,
        }
      : {}),
    ...item,
  }));
}
function validateSchema<T extends object>(options: ParseOptions<T>): void {
  config(
    options.schema &&
      typeof options.schema.fields === 'object' &&
      Object.keys(options.schema.fields).length > 0,
    'Schema requires fields'
  );
  for (const [key, value] of Object.entries(options.schema.fields)) {
    const rule = value as FieldRule<unknown>;
    config(rule && typeof rule === 'object', `Invalid field rule: ${key}`);
    config(
      !rule.type || ['string', 'number', 'boolean', 'date'].includes(rule.type),
      `Invalid field type: ${key}`
    );
    if (rule.type === 'date')
      config(
        rule.dateOutput === 'Date' || rule.dateOutput === 'date-string',
        `Date field ${key} requires dateOutput`
      );
  }
}
function parseDate(
  value: unknown,
  rule: FieldRule<unknown>,
  date1904: boolean,
  parseSerial: (
    value: number,
    options?: { date1904?: boolean }
  ) => {
    y: number;
    m: number;
    d: number;
    H: number;
    M: number;
    S: number;
    u?: number;
  } | null
): unknown {
  let date: Date;
  if (typeof value === 'number') {
    const parts = parseSerial(value, { date1904 });
    if (!parts || (parts.y === 1900 && parts.m === 2 && parts.d === 29))
      throw new Error('Invalid Excel date');
    date = new Date(0);
    date.setUTCFullYear(parts.y, parts.m - 1, parts.d);
    date.setUTCHours(
      parts.H,
      parts.M,
      parts.S,
      Math.round((parts.u ?? 0) * 1000)
    );
  } else if (value instanceof Date) date = value;
  else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error('Invalid calendar date');
  } else throw new Error('Expected an Excel date serial or YYYY-MM-DD');
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  return rule.dateOutput === 'Date' ? date : date.toISOString().slice(0, 10);
}

export async function parseExcel<T extends object>(
  input: ExcelInput,
  options: ParseOptions<T>
): Promise<ParseResult<T>> {
  try {
    validateSchema(options);
    const limits = resolveLimits(options.limits);
    if (options.csv?.delimiter !== undefined)
      config(
        options.csv.delimiter.length === 1 &&
          !/["\r\n]/.test(options.csv.delimiter),
        'CSV delimiter must be one non-quote, non-newline character'
      );
    if (options.csv?.codepage !== undefined)
      config(
        Number.isSafeInteger(options.csv.codepage) && options.csv.codepage > 0,
        'CSV codepage must be a positive integer'
      );
    phase(options, 'reading');
    const bytes = await readInput(input, limits.maxFileSize, options.signal);
    const XLSX = await abortable(loadEngine(), options.signal);
    if ((bytes[0] === 0xd0 && bytes[1] === 0xcf) || options.csv?.codepage)
      await abortable(ensureCodepages(XLSX), options.signal);
    checkAbort(options.signal);
    let workbook;
    try {
      workbook = XLSX.read(bytes, {
        type: 'array',
        raw: true,
        cellDates: false,
        cellNF: true,
        cellText: true,
        ...(options.csv?.delimiter ? { FS: options.csv.delimiter } : {}),
        ...(options.csv?.codepage ? { codepage: options.csv.codepage } : {}),
      });
    } catch (cause) {
      throw new ExcelError('PARSE_FAILED', 'Unable to decode workbook', {
        cause,
      });
    }
    checkAbort(options.signal);
    if (workbook.SheetNames.length > limits.maxSheets)
      throw new ExcelError('SHEET_LIMIT', 'Too many worksheets');
    const requested = options.sheet;
    const sheetIndex =
      requested && 'name' in requested
        ? workbook.SheetNames.indexOf(requested.name!)
        : (requested?.index ?? 0);
    config(Number.isInteger(sheetIndex), 'Sheet index must be an integer');
    const name = workbook.SheetNames[sheetIndex];
    const sheet: WorkSheet | undefined = workbook.Sheets[name];
    if (!sheet)
      throw new ExcelError(
        'SHEET_NOT_FOUND',
        'Requested worksheet does not exist'
      );
    phase(options, 'matching');
    // Never expand !ref: malformed files may claim an enormous range.
    const cells = new Map<number, Map<number, CellObject>>();
    const presentColumns = new Set<number>();
    let maxRow = -1;
    let count = 0;
    for (const key of Object.keys(sheet)) {
      if (key.startsWith('!')) continue;
      if (!/^[A-Z]{1,3}[1-9]\d*$/.test(key)) continue;
      if (++count > limits.maxCells)
        throw new ExcelError('CELL_LIMIT', 'Worksheet exceeds cell limit');
      const { r, c } = XLSX.utils.decode_cell(key);
      if (r >= 1_048_576 || c >= 16_384)
        throw new ExcelError('RANGE_LIMIT', 'Invalid worksheet coordinates');
      presentColumns.add(c);
      if (c >= limits.maxColumns)
        throw new ExcelError('COLUMN_LIMIT', 'Worksheet exceeds column limit');
      let row = cells.get(r);
      if (!row) {
        row = new Map();
        cells.set(r, row);
      }
      row.set(c, sheet[key] as CellObject);
      maxRow = Math.max(maxRow, r);
    }
    const merges = (sheet['!merges'] ?? []) as Range[];
    if (merges.length > limits.maxCells)
      throw new ExcelError('CELL_LIMIT', 'Too many merge ranges');
    for (const range of merges) {
      config(
        [range.s.r, range.s.c, range.e.r, range.e.c].every(
          Number.isSafeInteger
        ) &&
          range.s.r >= 0 &&
          range.s.c >= 0 &&
          range.e.r >= range.s.r &&
          range.e.c >= range.s.c &&
          range.e.r < 1_048_576 &&
          range.e.c < 16_384,
        'Invalid worksheet merge range'
      );
    }
    const rawCell = (r: number, c: number) => cells.get(r)?.get(c);
    const text = (cell?: CellObject): string =>
      String(cell?.w ?? cell?.v ?? '');
    const normalized = (value: string): string => {
      let result = value.trim();
      if (options.normalizeHeader) {
        try {
          result = options.normalizeHeader(result);
        } catch (cause) {
          throw new ExcelError('CALLBACK_FAILED', 'Header normalizer failed', {
            cause,
          });
        }
        config(
          typeof result === 'string',
          'normalizeHeader must return a string'
        );
      }
      return options.headerCaseSensitive === false
        ? result.toLowerCase()
        : result;
    };
    const warnings: ExcelIssue[] = [];
    let issuesCount = 0;
    const addCount = (number: number) => {
      issuesCount += number;
      if (issuesCount > limits.maxIssues)
        throw new ExcelError('ISSUE_LIMIT', 'Validation issue limit exceeded');
    };
    const header = options.header;
    config(
      header && ['named', 'path', 'position'].includes(header.mode),
      'Invalid import header mode'
    );
    const bindings = new Map<string, number>();
    const fields = Object.keys(options.schema.fields);
    for (const key of Object.keys(header.bindings))
      config(fields.includes(key), `Unknown import field: ${key}`);
    const headerRows =
      header.mode === 'named'
        ? [rowIndex(header.row, 'header.row')]
        : header.mode === 'path'
          ? header.rows.map(row => rowIndex(row, 'header.rows'))
          : [];
    if (header.mode === 'path')
      config(
        headerRows.length > 0 &&
          headerRows.every(
            (row, index) => index === 0 || row > headerRows[index - 1]
          ),
        'Header rows must be nonempty, unique and ascending'
      );
    config(headerRows.length <= 32, 'Import header depth exceeds 32 rows');
    const headerEnd = headerRows.length ? Math.max(...headerRows) : -1;
    const start =
      header.mode === 'position'
        ? rowIndex(options.dataStartRow ?? header.dataStartRow, 'dataStartRow')
        : options.dataStartRow === undefined
          ? headerEnd + 1
          : rowIndex(options.dataStartRow, 'dataStartRow');
    config(start > headerEnd, 'Data must start after the header');
    const columns = [...presentColumns].sort((a, b) => a - b);
    const mergedHeaders = new Map<string, { r: number; c: number }>();
    if (header.mode === 'path')
      for (const range of merges) {
        for (const row of headerRows) {
          if (row < range.s.r || row > range.e.r) continue;
          for (const column of columns) {
            if (column < range.s.c || column > range.e.c) continue;
            const key = `${row}:${column}`;
            config(!mergedHeaders.has(key), 'Overlapping header merge ranges');
            mergedHeaders.set(key, range.s);
          }
        }
      }
    const paths = new Map<number, string[]>();
    if (header.mode !== 'position') {
      for (const column of columns) {
        const anchors = new Set<string>();
        const path = headerRows.map(row => {
          if (header.mode === 'named')
            return normalized(text(rawCell(row, column)));
          const merge = mergedHeaders.get(`${row}:${column}`);
          const anchor = `${merge?.r ?? row}:${merge?.c ?? column}`;
          if (anchors.has(anchor)) return '';
          anchors.add(anchor);
          return normalized(
            text(merge ? rawCell(merge.r, merge.c) : rawCell(row, column))
          );
        });
        // Vertically merged leaf titles appear once in a path.
        paths.set(
          column,
          path.filter(value => value !== '')
        );
      }
    }
    for (const field of Object.keys(header.bindings)) {
      if (header.mode === 'position') {
        bindings.set(
          field,
          columnIndex(header.bindings[field as keyof typeof header.bindings]!)
        );
        continue;
      }
      let matches: number[];
      let required: boolean | undefined;
      if (header.mode === 'named') {
        const binding = header.bindings[field as keyof typeof header.bindings]!;
        const titles = [binding.title, ...(binding.aliases ?? [])].map(
          normalized
        );
        config(titles.every(Boolean), `Empty header name for ${field}`);
        matches = columns.filter(column =>
          titles.includes(paths.get(column)?.[0] ?? '')
        );
        required = binding.requiredHeader;
      } else {
        const binding = header.bindings[field as keyof typeof header.bindings]!;
        config(binding.path.length > 0, `Empty header path for ${field}`);
        const expected = binding.path.map(normalized);
        config(expected.every(Boolean), `Empty header path for ${field}`);
        matches = columns.filter(
          column =>
            JSON.stringify(paths.get(column)) === JSON.stringify(expected)
        );
        required = binding.requiredHeader;
      }
      if (matches.length > 1)
        throw new ExcelError(
          'AMBIGUOUS_HEADER',
          `Multiple columns match ${field}`,
          {
            issues: [
              {
                code: 'AMBIGUOUS_HEADER',
                message: `Multiple columns match ${field}`,
                field,
              },
            ],
          }
        );
      if (!matches.length && required !== false)
        throw new ExcelError('MISSING_HEADER', `Missing column for ${field}`, {
          issues: [
            {
              code: 'MISSING_HEADER',
              message: `Missing column for ${field}`,
              field,
            },
          ],
        });
      if (matches.length) bindings.set(field, matches[0]);
    }
    config(
      new Set(bindings.values()).size === bindings.size,
      'Multiple fields cannot bind the same input column'
    );
    for (const position of bindings.values())
      if (position >= limits.maxColumns)
        throw new ExcelError('COLUMN_LIMIT', 'Binding exceeds column limit');
    const unknown = columns.filter(
      column => ![...bindings.values()].includes(column)
    );
    config(
      ['ignore', 'warn', 'error'].includes(options.unknownColumns ?? 'ignore'),
      'Invalid unknownColumns policy'
    );
    if (unknown.length && options.unknownColumns === 'error')
      throw new ExcelError(
        'UNKNOWN_COLUMN',
        `Unmapped columns: ${unknown.map(columnName).join(', ')}`
      );
    if (options.unknownColumns === 'warn')
      for (const column of unknown)
        warnings.push({
          code: 'UNKNOWN_COLUMN',
          message: 'Unmapped column ignored',
          column: columnName(column),
        });
    addCount(warnings.length);
    const end =
      options.dataEndRow === undefined
        ? maxRow
        : Math.min(maxRow, rowIndex(options.dataEndRow, 'dataEndRow'));
    if (options.dataEndRow !== undefined)
      config(
        rowIndex(options.dataEndRow, 'dataEndRow') >= start,
        'dataEndRow must not precede dataStartRow'
      );
    if (end - start + 1 > limits.maxRows)
      throw new ExcelError('ROW_LIMIT', 'Data range exceeds row limit');
    phase(options, 'validating');
    const result: ParseResult<T> = {
      sheet: { name, index: sheetIndex },
      validRows: [],
      invalidRows: [],
      warnings,
      summary: {
        scannedRows: Math.max(0, end - start + 1),
        validRows: 0,
        invalidRows: 0,
        skippedRows: 0,
      },
    };
    for (let r = start; r <= end; r++) {
      checkAbort(options.signal);
      const rowCells = cells.get(r);
      if (
        options.skipEmptyRows !== false &&
        (!rowCells ||
          [...rowCells.values()].every(cell => empty(cell.v) && !cell.f))
      ) {
        result.summary.skippedRows++;
        continue;
      }
      const raw: Record<string, unknown> = {};
      const data: Partial<T> = {};
      const issues: ExcelIssue[] = [];
      for (const c of columns)
        ownSet(raw, columnName(c), rawCell(r, c)?.v ?? null);
      for (const field of fields) {
        const rule = options.schema.fields[
          field as keyof T
        ] as FieldRule<unknown>;
        const c = bindings.get(field);
        const cell = c === undefined ? undefined : rawCell(r, c);
        const context: CellContext = {
          rowNumber: r + 1,
          column: c === undefined ? '' : columnName(c),
          field,
          raw: cell?.v,
          formatted: text(cell),
        };
        if (cell?.t === 'e') {
          issues.push(issue('CELL_ERROR', 'Excel error cell', context));
          continue;
        }
        if (cell?.f) {
          if (cell.v === undefined || cell.v === null) {
            issues.push(
              issue('FORMULA_NO_CACHE', 'Formula has no cached value', context)
            );
            continue;
          }
          warnings.push(
            issue(
              'FORMULA_CACHE',
              'Formula cached result may be stale',
              context
            )
          );
          addCount(1);
        }
        let value: unknown =
          rule.read === 'formatted' ||
          (rule.read !== 'raw' && rule.type === 'string')
            ? text(cell)
            : cell?.v;
        if (typeof value === 'string' && rule.trim !== false)
          value = value.trim();
        if (empty(value)) value = rule.defaultValue;
        if (empty(value)) {
          if (rule.required)
            issues.push(issue('REQUIRED', 'Value is required', context));
          else if (value !== undefined) ownSet(data, field, value);
          continue;
        }
        try {
          if (rule.parse) {
            try {
              value = rule.parse(value, context);
            } catch (cause) {
              throw new ExcelError(
                'CALLBACK_FAILED',
                `Parser failed for ${field}`,
                {
                  cause,
                  issues: [
                    issue('CALLBACK_FAILED', 'Custom parser failed', context),
                  ],
                }
              );
            }
          } else if (rule.type === 'string') value = String(value);
          else if (rule.type === 'number') {
            if (
              typeof value !== 'number' &&
              (typeof value !== 'string' ||
                !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
            )
              throw new Error('Expected a number');
            value = Number(value);
            if (!Number.isFinite(value))
              throw new Error('Expected a finite number');
          } else if (rule.type === 'boolean') {
            if (typeof value === 'boolean') {
              /* preserve */
            } else if (
              typeof value === 'string' &&
              /^(true|false)$/i.test(value)
            )
              value = value.toLowerCase() === 'true';
            else if (
              rule.booleanNumbers &&
              (value === 0 || value === 1 || value === '0' || value === '1')
            )
              value = Number(value) === 1;
            else throw new Error('Expected true or false');
          } else if (rule.type === 'date')
            value = parseDate(
              value,
              rule,
              !!workbook.Workbook?.WBProps?.date1904,
              XLSX.SSF.parse_date_code
            );
          if (empty(value) && rule.required) {
            issues.push(
              issue('REQUIRED', 'Converted value is required', context)
            );
            continue;
          }
          if (rule.parse && !empty(value) && rule.type) {
            const expected =
              rule.type === 'date'
                ? rule.dateOutput === 'Date'
                  ? 'Date'
                  : 'string'
                : rule.type;
            if (
              expected === 'Date'
                ? !(value instanceof Date) || !Number.isFinite(value.getTime())
                : typeof value !== expected
            )
              throw new Error(`Custom parser must return ${expected}`);
          }
          if (typeof value === 'number' && !Number.isFinite(value))
            throw new Error('Expected a finite number');
          if (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            !Number.isSafeInteger(value)
          ) {
            warnings.push(
              issue(
                'UNSAFE_INTEGER',
                'Integer precision may already be lost in Excel',
                context
              )
            );
            addCount(1);
          }
          if (
            rule.type === 'string' &&
            typeof cell?.v === 'number' &&
            !Number.isSafeInteger(cell.v) &&
            Number.isInteger(cell.v)
          ) {
            warnings.push(
              issue(
                'UNSAFE_INTEGER',
                'Text identifier was stored as an unsafe number',
                context
              )
            );
            addCount(1);
          }
          ownSet(data, field, value);
        } catch (cause) {
          if (cause instanceof ExcelError) throw cause;
          issues.push(
            issue('CONVERSION_FAILED', asExcelError(cause).message, context)
          );
          continue;
        }
        if (rule.validate) {
          try {
            issues.push(
              ...validationIssues(rule.validate(value, context), context)
            );
          } catch (cause) {
            throw new ExcelError(
              'CALLBACK_FAILED',
              `Validator failed for ${field}`,
              {
                cause,
                issues: [issue('CALLBACK_FAILED', 'Validator failed', context)],
              }
            );
          }
        }
      }
      if (!issues.length && options.schema.validateRow) {
        try {
          issues.push(
            ...validationIssues(
              options.schema.validateRow(data as T, { rowNumber: r + 1 })
            ).map(item => ({ rowNumber: r + 1, ...item }))
          );
        } catch (cause) {
          throw new ExcelError('CALLBACK_FAILED', 'Row validator failed', {
            cause,
            issues: [
              {
                code: 'CALLBACK_FAILED',
                message: 'Row validator failed',
                rowNumber: r + 1,
              },
            ],
          });
        }
      }
      addCount(issues.length);
      if (issues.length)
        result.invalidRows.push({
          rowNumber: r + 1,
          raw,
          partialData: data,
          issues,
        });
      else result.validRows.push({ rowNumber: r + 1, data: data as T });
    }
    result.summary.validRows = result.validRows.length;
    result.summary.invalidRows = result.invalidRows.length;
    checkAbort(options.signal);
    return result;
  } catch (error) {
    throw asExcelError(error, 'IMPORT_FAILED');
  }
}
