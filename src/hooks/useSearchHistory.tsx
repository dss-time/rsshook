import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addSearchHistoryRecord,
  filterExpiredSearchHistory,
  removeSearchHistoryRecord,
  type SearchHistoryRecord,
  type SearchHistoryStorage,
} from '../core/searchHistory';
export interface SearchHistoryOptions {
  storageKey?: string;
  storage?: SearchHistoryStorage;
  maxRecords?: number;
  maxDays?: number;
  migrate?: (stored: unknown) => SearchHistoryRecord[];
  onStorageError?: (error: unknown) => void;
}
const eventName = 'rsshook:search-history';
/** Supports legacy (maxRecords, maxDays) and isolated per-page/user storage. */
export default function useSearchHistory(
  input: number | SearchHistoryOptions = 8,
  days = 7
) {
  const options: SearchHistoryOptions =
    typeof input === 'number' ? { maxRecords: input, maxDays: days } : input;
  const { storageKey = 'searchHistory', maxRecords = 8, maxDays = 7 } = options;
  const latest = useRef(options);
  latest.current = options;
  const storage =
    options.storage ??
    (typeof window === 'undefined'
      ? undefined
      : (() => {
          try {
            return window.localStorage;
          } catch {
            return undefined;
          }
        })());
  const memory = useRef<{
    key: string;
    storage: SearchHistoryStorage | undefined;
    records: SearchHistoryRecord[];
    dirty: boolean;
  }>({ key: storageKey, storage, records: [], dirty: false });
  if (memory.current.key !== storageKey || memory.current.storage !== storage)
    memory.current = { key: storageKey, storage, records: [], dirty: false };
  const read = useCallback(() => {
    if (!storage || memory.current.dirty) return memory.current.records;
    try {
      const raw = storage?.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const migrated = latest.current.migrate
        ? latest.current.migrate(parsed)
        : parsed;
      const valid = Array.isArray(migrated)
        ? migrated.filter(
            (r): r is SearchHistoryRecord =>
              !!r && typeof r.value === 'string' && typeof r.time === 'string'
          )
        : [];
      const records = filterExpiredSearchHistory(valid, maxDays).slice(
        0,
        maxRecords
      );
      memory.current.records = records;
      return records;
    } catch (error) {
      latest.current.onStorageError?.(error);
      return memory.current.records;
    }
  }, [storage, storageKey, maxDays, maxRecords]);
  const [searchHistory, setHistory] = useState<SearchHistoryRecord[]>(read);
  useEffect(() => {
    const sync = () => setHistory(read());
    sync();
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', sync);
    window.addEventListener(eventName, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(eventName, sync);
    };
  }, [read]);
  const commit = useCallback(
    (change: (current: SearchHistoryRecord[]) => SearchHistoryRecord[]) => {
      const next = change(read());
      memory.current.records = next;
      setHistory(next);
      try {
        if (next.length) storage?.setItem(storageKey, JSON.stringify(next));
        else storage?.removeItem(storageKey);
        memory.current.dirty = false;
        if (storage && typeof window !== 'undefined')
          window.dispatchEvent(new window.Event(eventName));
      } catch (error) {
        memory.current.dirty = true;
        latest.current.onStorageError?.(error);
      }
    },
    [read, storage, storageKey]
  );
  const setSearchValue = useCallback(
    (value: string) =>
      commit(current => addSearchHistoryRecord(current, value, maxRecords)),
    [commit, maxRecords]
  );
  const removeSearchValue = useCallback(
    (value: string) =>
      commit(current => removeSearchHistoryRecord(current, value)),
    [commit]
  );
  const handleClearHistory = useCallback(() => commit(() => []), [commit]);
  return {
    searchHistory,
    setSearchValue,
    removeSearchValue,
    handleClearHistory,
  };
}
