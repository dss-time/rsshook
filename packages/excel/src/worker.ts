import * as XLSX from 'xlsx';
import * as codepages from 'xlsx/dist/cpexcel.full.mjs';
import { openCsvSource } from './csv-read';
import { decodeSheet } from './raw';
import { asExcelError } from './errors';
import { readInput } from './engine';
import type { RawSource } from './raw-types';

XLSX.set_cptable(codepages);
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let source: RawSource | undefined;
let workbook = XLSX.utils.book_new();
let sheet: import('xlsx').WorkSheet;
let offset = 0;
scope.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    let value: unknown;
    switch (type) {
      case 'read': {
        source =
          payload.format === 'csv'
            ? await openCsvSource(payload.input, payload.options)
            : decodeSheet(
                await readInput(
                  payload.input,
                  payload.options.limits.maxFileSize
                ),
                payload.options,
                XLSX
              );
        value = source.meta;
        break;
      }
      case 'pull':
        value = await source!.next(payload);
        break;
      case 'book':
        workbook = XLSX.utils.book_new();
        break;
      case 'sheet':
        sheet = XLSX.utils.aoa_to_sheet([]);
        offset = 0;
        XLSX.utils.book_append_sheet(workbook, sheet, payload);
        break;
      case 'rows':
        XLSX.utils.sheet_add_aoa(sheet, payload, {
          origin: { r: offset, c: 0 },
        });
        offset += payload.length;
        break;
      case 'style': {
        sheet['!merges'] = payload.merges;
        sheet['!cols'] = payload.columns.map((c: { width?: number }) =>
          c.width === undefined ? {} : { wch: c.width }
        );
        for (const [position, format] of payload.formats)
          for (let i = 0; i < payload.count; i++) {
            const cell =
              sheet[
                XLSX.utils.encode_cell({ r: payload.start + i, c: position })
              ];
            if (cell) cell.z = format;
          }
        break;
      }
      case 'write': {
        let bytes: Uint8Array;
        if (payload.format === 'csv')
          bytes = new TextEncoder().encode(
            `${payload.csv?.bom === false ? '' : '\uFEFF'}${XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]], { FS: payload.csv?.delimiter ?? ',' })}`
          );
        else
          bytes = new Uint8Array(
            XLSX.write(workbook, {
              type: 'array',
              bookType: payload.format === 'xls' ? 'biff8' : 'xlsx',
              compression: true,
            })
          );
        scope.postMessage({ id, value: bytes }, [bytes.buffer]);
        return;
      }
      default:
        throw new Error('Unknown Worker command');
    }
    scope.postMessage({ id, value });
  } catch (cause) {
    const error = asExcelError(cause);
    scope.postMessage({
      id,
      error: { code: error.code, message: error.message, issues: error.issues },
    });
  }
};
