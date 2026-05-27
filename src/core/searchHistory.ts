export interface SearchHistoryRecord {
  value: string;
  time: string;
}

export interface SearchHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SEARCH_HISTORY_KEY = "searchHistory";

export const getDefaultStorage = (): SearchHistoryStorage | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
};

export const readSearchHistory = (
  storage = getDefaultStorage(),
  storageKey = DEFAULT_SEARCH_HISTORY_KEY
): SearchHistoryRecord[] => {
  if (!storage) return [];

  try {
    const history = storage.getItem(storageKey);
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
};

export const writeSearchHistory = (
  history: SearchHistoryRecord[],
  storage = getDefaultStorage(),
  storageKey = DEFAULT_SEARCH_HISTORY_KEY
) => {
  if (!storage) return;
  storage.setItem(storageKey, JSON.stringify(history));
};

export const clearSearchHistory = (
  storage = getDefaultStorage(),
  storageKey = DEFAULT_SEARCH_HISTORY_KEY
) => {
  if (!storage) return;
  storage.removeItem(storageKey);
};

export const addSearchHistoryRecord = (
  history: SearchHistoryRecord[],
  value: string,
  maxRecords = 8
): SearchHistoryRecord[] => {
  const searchValue = value.trim();
  if (!searchValue) return history;

  const nextHistory = history.filter(record => record.value !== searchValue);
  nextHistory.unshift({ value: searchValue, time: new Date().toISOString() });

  return nextHistory.slice(0, maxRecords);
};

export const removeSearchHistoryRecord = (
  history: SearchHistoryRecord[],
  value: string
): SearchHistoryRecord[] => {
  return history.filter(record => record.value !== value);
};

export const filterExpiredSearchHistory = (
  history: SearchHistoryRecord[],
  maxDays = 7
): SearchHistoryRecord[] => {
  const currentTime = Date.now();

  return history.filter(record => {
    const time = new Date(record.time).getTime();
    return (currentTime - time) / (1000 * 60 * 60 * 24) <= maxDays;
  });
};
