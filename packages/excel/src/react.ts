import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BatchParseOptions,
  CsvInput,
  ImportBatchesOptions,
  ImportReport,
  CsvWriteOptions,
  CsvWriteReport,
  DownloadOptions,
  ExcelInput,
  OperationOptions,
  OperationPhase,
  OperationState,
  ParseOptions,
  ParseResult,
  UseExcelOptions,
} from './types';
import { ExcelError, asExcelError, config } from './errors';
import { parseExcel, importBatches } from './import';
import { writeCsv } from './csv-write';
import { downloadExcel } from './browser';
export type { UseExcelOptions, OperationState } from './types';

interface Task {
  controller: AbortController;
  unlink: () => void;
}
function makeTask(signal?: AbortSignal): Task {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  return {
    controller,
    unlink: () => signal?.removeEventListener('abort', abort),
  };
}
export interface UseExcelReturn<T extends object> {
  parse: (
    input: ExcelInput,
    options?: Partial<Omit<ParseOptions<T>, 'schema'>>
  ) => Promise<ParseResult<T>>;
  download: <R extends object = T>(
    options: DownloadOptions<R>
  ) => Promise<void>;
  importBatches: (
    input: CsvInput,
    options: Partial<Omit<BatchParseOptions<T>, 'schema'>> &
      Pick<ImportBatchesOptions<T>, 'onBatch'>
  ) => Promise<ImportReport>;
  writeCsv: <R extends object = T>(
    options: CsvWriteOptions<R>
  ) => Promise<CsvWriteReport>;
  cancel: (operation?: 'parse' | 'export' | 'all') => void;
  reset: () => void;
  parseState: OperationState;
  exportState: OperationState;
}
/** One parsing channel (latest wins) and one exporting channel (reject while busy). */
export function useExcel<T extends object>(
  options: UseExcelOptions<T>
): UseExcelReturn<T> {
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const parsing = useRef<Task | null>(null);
  const exporting = useRef<Task | null>(null);
  const [parseState, setParseState] = useState<OperationState>({
    status: 'idle',
  });
  const [exportState, setExportState] = useState<OperationState>({
    status: 'idle',
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const ref of [parsing, exporting]) {
        ref.current?.controller.abort();
        ref.current?.unlink();
        ref.current = null;
      }
    };
  }, []);
  const run = useCallback(
    async <R>(
      kind: 'parse' | 'export',
      settings: OperationOptions,
      execute: (options: OperationOptions) => Promise<R>
    ): Promise<R> => {
      if (!mounted.current)
        throw new ExcelError('CANCELLED', 'Hook has unmounted');
      const ref = kind === 'parse' ? parsing : exporting;
      const setState = kind === 'parse' ? setParseState : setExportState;
      if (ref.current) {
        if (kind === 'export')
          throw new ExcelError('BUSY', 'An export is already running');
        ref.current.controller.abort();
        ref.current.unlink();
      }
      const task = makeTask(settings.signal);
      ref.current = task;
      const active = () => mounted.current && ref.current === task;
      const onPhase = (phase: OperationPhase) => {
        if (active()) setState({ status: 'running', phase });
        settings.onPhase?.(phase);
      };
      try {
        const result = await execute({
          signal: task.controller.signal,
          onPhase,
        });
        if (task.controller.signal.aborted)
          throw new ExcelError('CANCELLED', 'Operation cancelled');
        if (active()) setState({ status: 'success' });
        return result;
      } catch (cause) {
        const error = asExcelError(cause);
        if (active())
          setState(
            error.code === 'CANCELLED'
              ? { status: 'cancelled' }
              : { status: 'error', error }
          );
        throw error;
      } finally {
        task.unlink();
        if (ref.current === task) ref.current = null;
      }
    },
    []
  );
  const parse = useCallback<UseExcelReturn<T>['parse']>(
    (input, overrides = {}) => {
      const defaults = latest.current.importDefaults;
      const settings = {
        execution: latest.current.execution,
        ...defaults,
        ...overrides,
        limits: { ...defaults?.limits, ...overrides.limits },
        csv: { ...defaults?.csv, ...overrides.csv },
        schema: latest.current.schema,
      };
      return run('parse', settings, async operation => {
        config(
          settings.header,
          'Provide a header in importDefaults or parse options'
        );
        return parseExcel(input, {
          ...settings,
          ...operation,
        } as ParseOptions<T>);
      });
    },
    [run]
  );
  const download = useCallback(
    async <R extends object>(overrides: DownloadOptions<R>): Promise<void> => {
      const defaults = latest.current.exportDefaults;
      const settings = {
        execution: latest.current.execution,
        ...defaults,
        ...overrides,
        limits: { ...defaults?.limits, ...overrides.limits },
        csv: { ...defaults?.csv, ...overrides.csv },
      };
      return run('export', settings, operation =>
        downloadExcel({ ...settings, ...operation })
      );
    },
    [run]
  );
  const consume = useCallback<UseExcelReturn<T>['importBatches']>(
    (input, overrides) => {
      const defaults = latest.current.importDefaults;
      const settings = {
        execution: latest.current.execution,
        ...defaults,
        ...overrides,
        limits: { ...defaults?.limits, ...overrides.limits },
        csv: { ...defaults?.csv, ...overrides.csv },
        schema: latest.current.schema,
      };
      return run('parse', settings, operation => {
        config(
          settings.header,
          'Provide a header in importDefaults or import options'
        );
        return importBatches(input, {
          ...settings,
          ...operation,
        } as ImportBatchesOptions<T>);
      });
    },
    [run]
  );
  const write = useCallback(
    async <R extends object>(overrides: CsvWriteOptions<R>) => {
      const defaults = latest.current.exportDefaults;
      const settings = {
        execution: latest.current.execution,
        ...defaults,
        ...overrides,
        limits: { ...defaults?.limits, ...overrides.limits },
        csv: { ...defaults?.csv, ...overrides.csv },
      };
      return run('export', settings, operation =>
        writeCsv({ ...settings, ...operation })
      );
    },
    [run]
  );
  const cancel = useCallback(
    (operation: 'parse' | 'export' | 'all' = 'all') => {
      if (operation !== 'export') parsing.current?.controller.abort();
      if (operation !== 'parse') exporting.current?.controller.abort();
    },
    []
  );
  const reset = useCallback(() => {
    for (const ref of [parsing, exporting]) {
      ref.current?.controller.abort();
      ref.current?.unlink();
      ref.current = null;
    }
    if (mounted.current) {
      setParseState({ status: 'idle' });
      setExportState({ status: 'idle' });
    }
  }, []);
  return {
    parse,
    download,
    importBatches: consume,
    writeCsv: write,
    cancel,
    reset,
    parseState,
    exportState,
  };
}
