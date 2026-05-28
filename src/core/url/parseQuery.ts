/**
 * Query array parse strategy.
 */
export type QueryArrayFormat = 'comma' | 'repeat' | 'bracket';

/**
 * Options for parsing a query string.
 */
export interface ParseQueryOptions {
  /**
   * Array format used by the query string.
   *
   * @default "repeat"
   */
  arrayFormat?: QueryArrayFormat;
  /**
   * Parse numeric strings into numbers.
   *
   * @default false
   */
  parseNumber?: boolean;
  /**
   * Parse "true" and "false" into booleans.
   *
   * @default false
   */
  parseBoolean?: boolean;
  /**
   * Skip entries whose value is an empty string.
   *
   * @default false
   */
  skipEmpty?: boolean;
  /**
   * Default values merged before parsed query values.
   */
  defaults?: Record<string, unknown>;
}

const NUMBER_REGEXP = /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i;

const normalizeQuery = (query: string) =>
  query.startsWith('?') ? query.slice(1) : query;

const normalizeKey = (key: string, arrayFormat: QueryArrayFormat) =>
  arrayFormat === 'bracket' && key.endsWith('[]') ? key.slice(0, -2) : key;

const parseValue = (
  value: string,
  parseNumber: boolean,
  parseBoolean: boolean
) => {
  if (parseBoolean) {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  if (parseNumber && NUMBER_REGEXP.test(value)) {
    return Number(value);
  }

  return value;
};

const appendValue = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
) => {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    const currentValue = target[key];
    target[key] = Array.isArray(currentValue)
      ? currentValue.concat(value)
      : [currentValue, value];
    return;
  }

  target[key] = value;
};

/**
 * Parse a query string into an object without depending on qs.
 *
 * The input query may start with "?" or be a raw query string.
 *
 * @param query Query string.
 * @param options Parse options.
 * @returns Parsed query object.
 */
export function parseQuery(
  query: string,
  options: ParseQueryOptions = {}
): Record<string, unknown> {
  const {
    arrayFormat = 'repeat',
    parseNumber = false,
    parseBoolean = false,
    skipEmpty = false,
    defaults = {},
  } = options;
  const result: Record<string, unknown> = { ...defaults };
  const searchParams = new URLSearchParams(normalizeQuery(query));

  searchParams.forEach((rawValue, rawKey) => {
    if (skipEmpty && rawValue === '') {
      return;
    }

    const key = normalizeKey(rawKey, arrayFormat);
    const values =
      arrayFormat === 'comma'
        ? rawValue.split(',').filter(value => !(skipEmpty && value === ''))
        : [rawValue];

    values.forEach(value => {
      appendValue(result, key, parseValue(value, parseNumber, parseBoolean));
    });
  });

  return result;
}

/**
 * @example
 * const result = parseQuery('?ids=1,2,3&keyword=abc&page=1', {
 *   arrayFormat: 'comma',
 *   parseNumber: true,
 * });
 *
 * // {
 * //   ids: [1, 2, 3],
 * //   keyword: 'abc',
 * //   page: 1,
 * // }
 */
