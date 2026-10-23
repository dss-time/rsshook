import type {
  QueryArrayFormat,
  SyncSearchFormWithUrlOptions,
} from './syncSearchFormWithUrl';
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

const createQueryParams = (
  values: Record<string, unknown>,
  options: SyncSearchFormWithUrlOptions = {}
) => {
  const {
    fields,
    fieldMap = {},
    arrayFormat = 'repeat',
    removeEmpty = true,
  } = options;
  const fieldSet = fields ? new Set(fields) : undefined;
  const shouldUseField = (field: string) => !fieldSet || fieldSet.has(field);
  const getQueryKey = (field: string) => fieldMap[field] || field;
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

  return params;
};

export const stringifyQuery = (
  values: Record<string, unknown>,
  options: SyncSearchFormWithUrlOptions = {}
) => createQueryParams(values, options).toString();

export const mergeQuery = (
  url: string,
  values: Record<string, unknown>,
  options: SyncSearchFormWithUrlOptions = {}
) => {
  const { fields, fieldMap = {} } = options;
  const fieldSet = fields ? new Set(fields) : undefined;
  const shouldUseField = (field: string) => !fieldSet || fieldSet.has(field);
  const getQueryKey = (field: string) => fieldMap[field] || field;
  const { base, search, hash } = splitUrl(url);
  const currentParams = new URLSearchParams(search);
  const nextParams = createQueryParams(values, options);

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
