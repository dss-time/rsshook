import type {
  ExcelIssue,
  OperationOptions,
  OperationPhase,
  ExcelLimits,
} from './types';

export class ExcelError extends Error {
  readonly code: string;
  readonly issues: ExcelIssue[];
  readonly cause?: unknown;
  constructor(
    code: string,
    message: string,
    options: { issues?: ExcelIssue[]; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'ExcelError';
    this.code = code;
    this.issues = options.issues ?? [];
    this.cause = options.cause;
  }
}
export function asExcelError(
  error: unknown,
  code = 'OPERATION_FAILED'
): ExcelError {
  return error instanceof ExcelError
    ? error
    : new ExcelError(
        code,
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
}
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new ExcelError('CANCELLED', 'Operation cancelled', {
      cause: signal.reason,
    });
}
export function phase(options: OperationOptions, value: OperationPhase): void {
  checkAbort(options.signal);
  try {
    options.onPhase?.(value);
  } catch (error) {
    throw asExcelError(error, 'CALLBACK_FAILED');
  }
  checkAbort(options.signal);
}
export const DEFAULT_LIMITS: Readonly<Required<ExcelLimits>> = Object.freeze({
  maxFileSize: 10 * 1024 * 1024,
  maxRows: 20_000,
  maxColumns: 256,
  maxCells: 1_000_000,
  maxSheets: 20,
  maxIssues: 1_000,
});
export function resolveLimits(input?: ExcelLimits): Required<ExcelLimits> {
  const limits = { ...DEFAULT_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ExcelError(
        'INVALID_CONFIG',
        `${key} must be a positive safe integer`
      );
  }
  return limits;
}
export function config(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ExcelError('INVALID_CONFIG', message);
}
export function rowIndex(row: number, name: string): number {
  config(
    Number.isSafeInteger(row) && row > 0 && row <= 1_048_576,
    `${name} must be a 1-based Excel row`
  );
  return row - 1;
}
