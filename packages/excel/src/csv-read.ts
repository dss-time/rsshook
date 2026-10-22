import type { CsvInput } from './types';
import type { RawRow, RawSource, ReadConfig } from './raw-types';
import { ExcelError, checkAbort, config } from './errors';
import { abortable } from './engine';
import { chunkBytes, fireCleanup, yieldToHost } from './flow';
import { headerPlan } from './header-plan';

function readable(input: CsvInput): input is ReadableStream<Uint8Array> {
  return typeof (input as ReadableStream<Uint8Array>).getReader === 'function';
}
export async function* csvBytes(
  input: CsvInput,
  options: ReadConfig,
  signal?: AbortSignal
): AsyncGenerator<Uint8Array> {
  const size = chunkBytes(options.csv?.chunkBytes);
  let total = 0;
  const checked = (bytes: Uint8Array) => {
    config(
      bytes instanceof Uint8Array,
      'CSV byte streams must yield Uint8Array'
    );
    total += bytes.byteLength;
    if (total > options.limits.maxFileSize)
      throw new ExcelError('FILE_SIZE_LIMIT', 'File exceeds size limit');
  };
  if (readable(input)) {
    const reader = input.getReader();
    let done = false;
    const cancel = () => fireCleanup(() => reader.cancel(signal?.reason));
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        checkAbort(signal);
        const next = await abortable(reader.read(), signal);
        if (next.done) {
          done = true;
          break;
        }
        checked(next.value);
        for (let i = 0; i < next.value.length; i += size) {
          checkAbort(signal);
          yield next.value.subarray(i, i + size);
        }
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (!done) fireCleanup(() => reader.cancel());
      reader.releaseLock();
    }
  } else if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    checked(bytes);
    for (let i = 0; i < bytes.length; i += size) {
      checkAbort(signal);
      yield bytes.subarray(i, i + size);
    }
  } else {
    if (input.size > options.limits.maxFileSize)
      throw new ExcelError('FILE_SIZE_LIMIT', 'File exceeds size limit');
    for (let i = 0; i < input.size; i += size) {
      checkAbort(signal);
      const bytes = new Uint8Array(
        await abortable(input.slice(i, i + size).arrayBuffer(), signal)
      );
      checked(bytes);
      yield bytes;
    }
  }
  if (!total) throw new ExcelError('EMPTY_FILE', 'File is empty');
}

/** Incremental RFC-style lexer; a suspended yield retains only the current record. */
class CsvLexer {
  private field = '';
  private row: string[] = [];
  private quoted = false;
  private afterQuote = false;
  private skipLF = false;
  private touched = false;
  private chars = 0;
  constructor(
    private delimiter: string,
    private maxChars: number,
    private maxColumns: number
  ) {}
  private finishField() {
    this.row.push(this.field);
    this.field = '';
    if (this.row.length > this.maxColumns)
      throw new ExcelError('COLUMN_LIMIT', 'CSV exceeds column limit');
  }
  private finishRow() {
    this.finishField();
    const row = this.row;
    this.row = [];
    this.touched = false;
    this.chars = 0;
    return row;
  }
  *feed(text: string): Generator<string[]> {
    for (const char of text) {
      if (this.skipLF) {
        this.skipLF = false;
        if (char === '\n') continue;
      }
      if (++this.chars > this.maxChars)
        throw new ExcelError(
          'CSV_RECORD_LIMIT',
          'CSV record exceeds maxRecordChars'
        );
      if (this.quoted) {
        if (char === '"') {
          this.quoted = false;
          this.afterQuote = true;
        } else this.field += char;
        continue;
      }
      if (this.afterQuote) {
        if (char === '"') {
          this.field += '"';
          this.quoted = true;
          this.afterQuote = false;
          continue;
        }
        if (char !== this.delimiter && char !== '\r' && char !== '\n')
          throw new ExcelError(
            'CSV_SYNTAX',
            'Unexpected character after closing quote'
          );
        this.afterQuote = false;
      }
      if (char === this.delimiter) {
        this.finishField();
        this.touched = true;
      } else if (char === '\r' || char === '\n') {
        if (char === '\r') this.skipLF = true;
        yield this.finishRow();
      } else if (char === '"') {
        if (this.field)
          throw new ExcelError(
            'CSV_SYNTAX',
            'Unexpected quote in unquoted field'
          );
        this.quoted = true;
        this.touched = true;
      } else {
        this.field += char;
        this.touched = true;
      }
    }
  }
  *finish(): Generator<string[]> {
    if (this.quoted)
      throw new ExcelError('CSV_SYNTAX', 'Unterminated quoted field');
    if (this.touched || this.field || this.row.length || this.afterQuote)
      yield this.finishRow();
  }
}
export async function* csvRecords(
  input: CsvInput,
  options: ReadConfig,
  signal?: AbortSignal
): AsyncGenerator<RawRow> {
  const delimiter = options.csv?.delimiter ?? ',';
  config(
    delimiter.length === 1 && !/["\r\n]/.test(delimiter),
    'CSV delimiter must be one non-quote, non-newline character'
  );
  const maxChars = options.csv?.maxRecordChars ?? 1_048_576;
  config(
    Number.isSafeInteger(maxChars) && maxChars > 0,
    'maxRecordChars must be a positive integer'
  );
  const encodings: Record<number, string> = {
    65001: 'utf-8',
    936: 'gb18030',
    950: 'big5',
    1252: 'windows-1252',
    1200: 'utf-16le',
    1201: 'utf-16be',
  };
  const encoding =
    options.csv?.encoding ??
    (options.csv?.codepage ? encodings[options.csv.codepage] : 'utf-8');
  if (!encoding)
    throw new ExcelError(
      'CSV_ENCODING',
      'Specify a supported TextDecoder encoding for this codepage'
    );
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true });
  } catch (cause) {
    throw new ExcelError('CSV_ENCODING', 'Unsupported CSV encoding', { cause });
  }
  const lexer = new CsvLexer(delimiter, maxChars, options.limits.maxColumns);
  let index = 0;
  let count = 0;
  let bytesSinceYield = 0;
  const raw = (values: string[]): RawRow => {
    count += values.length;
    if (count > options.limits.maxCells)
      throw new ExcelError('CELL_LIMIT', 'CSV exceeds cell limit');
    return {
      index: index++,
      cells: values.map((value, column) => [
        column,
        { t: 's', v: value, w: value },
      ]),
    };
  };
  try {
    for await (const bytes of csvBytes(input, options, signal)) {
      const text = decoder.decode(bytes, { stream: true });
      for (const values of lexer.feed(text)) {
        checkAbort(signal);
        yield raw(values);
      }
      bytesSinceYield += bytes.byteLength;
      if (bytesSinceYield >= 64 * 1024) {
        bytesSinceYield = 0;
        await yieldToHost(signal);
      }
    }
    for (const values of lexer.feed(decoder.decode())) yield raw(values);
    for (const values of lexer.finish()) yield raw(values);
  } catch (cause) {
    if (cause instanceof ExcelError) throw cause;
    throw new ExcelError('CSV_READ_FAILED', 'Unable to decode CSV', { cause });
  }
}
export async function openCsvSource(
  input: CsvInput,
  options: ReadConfig,
  signal?: AbortSignal
): Promise<RawSource> {
  const name = 'Sheet1';
  if (options.sheet && 'name' in options.sheet && options.sheet.name !== name)
    throw new ExcelError('SHEET_NOT_FOUND', 'CSV sheet is named Sheet1');
  if (options.sheet && 'index' in options.sheet && options.sheet.index !== 0)
    throw new ExcelError('SHEET_NOT_FOUND', 'CSV contains one sheet');
  const plan = headerPlan(options);
  const iterator = csvRecords(input, options, signal);
  const headers: RawRow[] = [];
  const columns = new Set<number>();
  let pending: RawRow | undefined;
  let ended = false;
  let last = -1;
  try {
    while (true) {
      const next = await abortable(iterator.next(), signal);
      if (next.done) {
        ended = true;
        break;
      }
      last = next.value.index;
      if (plan.rows.includes(last)) {
        headers.push(next.value);
        for (const [c] of next.value.cells) columns.add(c);
      }
      if (last >= plan.start) {
        pending = next.value;
        for (const [c] of pending.cells) columns.add(c);
        break;
      }
    }
  } catch (error) {
    fireCleanup(() => iterator.return(undefined));
    throw error;
  }
  let cursor = plan.start;
  return {
    meta: {
      sheet: { name, index: 0 },
      columns: [...columns].sort((a, b) => a - b),
      headerRows: headers,
      ...(ended ? { maxRow: last } : {}),
      merges: [],
      date1904: false,
    },
    async next(size) {
      const start = cursor;
      const rows: RawRow[] = [];
      while (rows.length < size && !ended && cursor <= plan.end) {
        if (!pending) {
          const next = await abortable(iterator.next(), signal);
          if (next.done) {
            ended = true;
            break;
          }
          pending = next.value;
        }
        if (pending.index > plan.end) {
          ended = true;
          break;
        }
        cursor = pending.index + 1;
        rows.push(pending);
        pending = undefined;
      }
      if (cursor > plan.end) ended = true;
      return { start, end: cursor - 1, rows, done: ended };
    },
    close() {
      fireCleanup(() => iterator.return(undefined));
    },
  };
}
