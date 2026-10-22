import type { CellObject } from 'xlsx';
import type {
  CellContext,
  ExcelIssue,
  FieldRule,
  ParseOptions,
  ParseResult,
  ValidationResult,
} from './types';
import { headerPlan } from './header-plan';
import type { RawBatch, RawMeta } from './raw-types';
import {
  ExcelError,
  asExcelError,
  checkAbort,
  config,
  phase,
  resolveLimits,
  rowIndex,
} from './errors';
import { columnIndex, columnName } from './engine';

function serialParts(value: number, options?: { date1904?: boolean }) {
  if (!Number.isFinite(value) || value < 0 || value > 2958465) return null;
  if (!options?.date1904 && Math.floor(value) === 60)
    return { y: 1900, m: 2, d: 29, H: 0, M: 0, S: 0, u: 0 };
  const epoch = options?.date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 31);
  const adjusted = options?.date1904 || value < 60 ? value : value - 1;
  const date = new Date(epoch + Math.round(adjusted * 86400000));
  if (date.getUTCFullYear() > 9999) return null;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    H: date.getUTCHours(),
    M: date.getUTCMinutes(),
    S: date.getUTCSeconds(),
    u: date.getUTCMilliseconds() / 1000,
  };
}
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
export function validateSchema<T extends object>(
  options: ParseOptions<T>
): void {
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

export function createProcessor<T extends object>(
  meta: RawMeta,
  options: ParseOptions<T>
) {
  validateSchema(options);
  const limits = resolveLimits(options.limits);
  let cells = new Map(
    meta.headerRows.map(row => [row.index, new Map(row.cells)])
  );
  const presentColumns = new Set(meta.columns);
  const merges = meta.merges;
  const { name, index: sheetIndex } = meta.sheet;
  const rawCell = (r: number, c: number) => cells.get(r)?.get(c);
  const text = (cell?: CellObject): string => String(cell?.w ?? cell?.v ?? '');
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
  let warnings: ExcelIssue[] = [];
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
  const { rows: headerRows, start } = headerPlan(options);
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
        column => JSON.stringify(paths.get(column)) === JSON.stringify(expected)
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
      ? (meta.maxRow ?? Number.MAX_SAFE_INTEGER)
      : Math.min(
          meta.maxRow ?? Number.MAX_SAFE_INTEGER,
          rowIndex(options.dataEndRow, 'dataEndRow')
        );
  if (options.dataEndRow !== undefined)
    config(
      rowIndex(options.dataEndRow, 'dataEndRow') >= start,
      'dataEndRow must not precede dataStartRow'
    );
  if (meta.maxRow !== undefined && end - start + 1 > limits.maxRows)
    throw new ExcelError('ROW_LIMIT', 'Data range exceeds row limit');
  phase(options, 'validating');
  return {
    start,
    end,
    process(batch: RawBatch): ParseResult<T> {
      const batchStart = Math.max(start, batch.start);
      const batchEnd = Math.min(end, batch.end);
      if (batchEnd >= batchStart && batchEnd - start + 1 > limits.maxRows)
        throw new ExcelError('ROW_LIMIT', 'Data range exceeds row limit');
      cells = new Map(batch.rows.map(row => [row.index, new Map(row.cells)]));
      for (const row of batch.rows)
        for (const [column] of row.cells) {
          if (column >= limits.maxColumns)
            throw new ExcelError(
              'COLUMN_LIMIT',
              'Worksheet exceeds column limit'
            );
          if (!presentColumns.has(column)) {
            presentColumns.add(column);
            columns.push(column);
            columns.sort((a, b) => a - b);
            if (![...bindings.values()].includes(column)) {
              if (options.unknownColumns === 'error')
                throw new ExcelError(
                  'UNKNOWN_COLUMN',
                  `Unmapped column: ${columnName(column)}`
                );
              if (options.unknownColumns === 'warn') {
                warnings.push({
                  code: 'UNKNOWN_COLUMN',
                  message: 'Unmapped column ignored',
                  column: columnName(column),
                });
                addCount(1);
              }
            }
          }
        }
      const result: ParseResult<T> = {
        sheet: { name, index: sheetIndex },
        validRows: [],
        invalidRows: [],
        warnings,
        summary: {
          scannedRows: Math.max(0, batchEnd - batchStart + 1),
          validRows: 0,
          invalidRows: 0,
          skippedRows: 0,
        },
      };
      for (let r = batchStart; r <= batchEnd; r++) {
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
                issue(
                  'FORMULA_NO_CACHE',
                  'Formula has no cached value',
                  context
                )
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
              value = parseDate(value, rule, meta.date1904, serialParts);
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
                  ? !(value instanceof Date) ||
                    !Number.isFinite(value.getTime())
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
                  issues: [
                    issue('CALLBACK_FAILED', 'Validator failed', context),
                  ],
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
      warnings = [];
      checkAbort(options.signal);
      return result;
    },
  };
}
