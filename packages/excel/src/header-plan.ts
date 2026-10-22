import type { ReadConfig } from './raw-types';
import { config, rowIndex } from './errors';
export function headerPlan(
  options: Pick<ReadConfig, 'header' | 'dataStartRow' | 'dataEndRow'>
) {
  const header = options.header;
  config(
    header && ['named', 'path', 'position'].includes(header.mode),
    'Invalid import header mode'
  );
  const rows =
    header.mode === 'named'
      ? [rowIndex(header.row, 'header.row')]
      : header.mode === 'path'
        ? header.rows.map(row => rowIndex(row, 'header.rows'))
        : [];
  config(rows.length <= 32, 'Import header depth exceeds 32 rows');
  if (header.mode === 'path')
    config(
      rows.length > 0 &&
        rows.every((row, index) => !index || row > rows[index - 1]),
      'Header rows must be nonempty, unique and ascending'
    );
  const headerEnd = rows.length ? Math.max(...rows) : -1;
  const start =
    options.dataStartRow !== undefined
      ? rowIndex(options.dataStartRow, 'dataStartRow')
      : header.mode === 'position'
        ? rowIndex(header.dataStartRow, 'dataStartRow')
        : headerEnd + 1;
  config(start > headerEnd, 'Data must start after the header');
  const end =
    options.dataEndRow === undefined
      ? Number.MAX_SAFE_INTEGER
      : rowIndex(options.dataEndRow, 'dataEndRow');
  config(end >= start, 'dataEndRow must not precede dataStartRow');
  return { rows, headerEnd, start, end };
}
