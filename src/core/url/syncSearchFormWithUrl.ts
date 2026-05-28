import { parseQuery, type QueryArrayFormat } from './parseQuery';

export type { QueryArrayFormat } from './parseQuery';

/**
 * Options for synchronizing search form values with URL query strings.
 */
export interface SyncSearchFormWithUrlOptions {
  /**
   * Field whitelist. Fields outside the list are ignored.
   */
  fields?: string[];
  /**
   * Map form field names to URL query field names.
   */
  fieldMap?: Record<string, string>;
  /**
   * Array stringify and parse strategy.
   *
   * @default "repeat"
   */
  arrayFormat?: QueryArrayFormat;
  /**
   * Remove empty values when stringifying.
   *
   * @default true
   */
  removeEmpty?: boolean;
  /**
   * Parse numeric strings into numbers when reading initial values.
   *
   * @default false
   */
  parseNumber?: boolean;
  /**
   * Parse "true" and "false" into booleans when reading initial values.
   *
   * @default false
   */
  parseBoolean?: boolean;
}

/**
 * URL synchronization helpers for search forms.
 */
export interface SyncSearchFormWithUrlInstance {
  /**
   * Parse a search string into initial form values.
   */
  getInitialValues: (search?: string) => Record<string, unknown>;
  /**
   * Convert form values into a query string without the leading "?".
   */
  stringify: (values: Record<string, unknown>) => string;
  /**
   * Merge form values into an existing URL.
   */
  mergeToUrl: (url: string, values: Record<string, unknown>) => string;
}

const isEmptyValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const appendQueryValue = (
  params: URLSearchParams,
  key: string,
  value: unknown,
  arrayFormat: QueryArrayFormat
) => {
  if (Array.isArray(value)) {
    if (arrayFormat === 'comma') {
      params.set(key, value.map(item => String(item)).join(','));
      return;
    }

    value.forEach(item => {
      params.append(arrayFormat === 'bracket' ? `${key}[]` : key, String(item));
    });
    return;
  }

  params.set(key, String(value));
};

const splitUrl = (url: string) => {
  const [urlWithoutHash, hash = ''] = url.split('#');
  const questionIndex = urlWithoutHash.indexOf('?');

  if (questionIndex === -1) {
    return {
      base: urlWithoutHash,
      search: '',
      hash: hash ? `#${hash}` : '',
    };
  }

  return {
    base: urlWithoutHash.slice(0, questionIndex),
    search: urlWithoutHash.slice(questionIndex + 1),
    hash: hash ? `#${hash}` : '',
  };
};

/**
 * Create helpers that synchronize table search form values with URL queries.
 *
 * The stringify method returns a query string without the leading "?".
 *
 * @param options Synchronization options.
 * @returns URL synchronization helper instance.
 */
export function syncSearchFormWithUrl(
  options: SyncSearchFormWithUrlOptions = {}
): SyncSearchFormWithUrlInstance {
  const {
    fields,
    fieldMap = {},
    arrayFormat = 'repeat',
    removeEmpty = true,
    parseNumber = false,
    parseBoolean = false,
  } = options;
  const fieldSet = fields ? new Set(fields) : undefined;
  const queryToFieldMap = Object.entries(fieldMap).reduce<Record<string, string>>(
    (result, [field, queryKey]) => {
      result[queryKey] = field;
      return result;
    },
    {}
  );

  const shouldUseField = (field: string) => !fieldSet || fieldSet.has(field);
  const getQueryKey = (field: string) => fieldMap[field] || field;
  const getFieldKey = (queryKey: string) => queryToFieldMap[queryKey] || queryKey;

  const getInitialValues = (search = '') => {
    const parsed = parseQuery(search, {
      arrayFormat,
      parseNumber,
      parseBoolean,
      skipEmpty: removeEmpty,
    });

    return Object.entries(parsed).reduce<Record<string, unknown>>(
      (result, [queryKey, value]) => {
        const field = getFieldKey(queryKey);

        if (shouldUseField(field)) {
          result[field] = value;
        }

        return result;
      },
      {}
    );
  };

  const stringify = (values: Record<string, unknown>) => {
    const params = new URLSearchParams();

    Object.entries(values).forEach(([field, value]) => {
      if (!shouldUseField(field)) {
        return;
      }

      if (removeEmpty && isEmptyValue(value)) {
        return;
      }

      appendQueryValue(params, getQueryKey(field), value, arrayFormat);
    });

    return params.toString();
  };

  const mergeToUrl = (url: string, values: Record<string, unknown>) => {
    const { base, search, hash } = splitUrl(url);
    const currentParams = new URLSearchParams(search);
    const nextQuery = stringify(values);
    const nextParams = new URLSearchParams(nextQuery);

    Object.keys(values).forEach(field => {
      if (!shouldUseField(field)) {
        return;
      }

      const queryKey = getQueryKey(field);
      currentParams.delete(queryKey);
      currentParams.delete(`${queryKey}[]`);
    });

    nextParams.forEach((value, key) => {
      currentParams.append(key, value);
    });

    const queryString = currentParams.toString();
    return `${base}${queryString ? `?${queryString}` : ''}${hash}`;
  };

  return {
    getInitialValues,
    stringify,
    mergeToUrl,
  };
}

/**
 * @example
 * // React Router
 * const sync = syncSearchFormWithUrl({ fields: ['keyword', 'page'] });
 * const initialValues = sync.getInitialValues(location.search);
 * navigate({ search: sync.stringify(formValues) });
 *
 * // Umi
 * history.push({ query: sync.getInitialValues(window.location.search) });
 *
 * // Vue Router
 * router.replace({ query: sync.getInitialValues(route.fullPath.split('?')[1]) });
 */
