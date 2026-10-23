import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { integer } from '../core/request/taskQueue';
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
  integer(maxRecords, 'maxRecords');
  if (!Number.isFinite(maxDays) || maxDays < 0)
    throw new RangeError('maxDays must be finite and >= 0');
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
  const memory = useMemo(
    () => ({
      storage,
      storageKey,
      records: [] as SearchHistoryRecord[],
      dirty: false,
    }),
    [storage, storageKey]
  );
  const active = useRef(memory);
  active.current = memory;
  const notifyError = useCallback((error: unknown) => {
    try {
      latest.current.onStorageError?.(error);
    } catch {
      /* Observers cannot break local state. */
    }
  }, []);
  const read = useCallback(() => {
    if (!memory.storage || memory.dirty)
      return filterExpiredSearchHistory(memory.records, maxDays).slice(
        0,
        maxRecords
      );
    try {
      const raw = memory.storage.getItem(memory.storageKey);
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
      memory.records = records;
      return records;
    } catch (error) {
      notifyError(error);
      return memory.records;
    }
  }, [maxDays, maxRecords, memory, notifyError]);
  const [state, setState] = useState(() => ({ memory, records: read() }));
  const setHistory = useCallback(
    (records: SearchHistoryRecord[]) => setState({ memory, records }),
    [memory]
  );
  const searchHistory = state.memory === memory ? state.records : [];
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event?.type === 'storage') {
        const { key, storageArea } = event as StorageEvent;
        if (
          (key !== null && key !== storageKey) ||
          (storageArea && storageArea !== storage)
        )
          return;
      }
      if (event?.type === eventName) {
        const detail = (event as CustomEvent).detail;
        if (detail?.key !== storageKey || detail?.storage !== storage) return;
      }
      setHistory(read());
    };
    sync();
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', sync);
    window.addEventListener(eventName, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(eventName, sync);
    };
  }, [read, setHistory, storageKey, storage]);
  const commit = useCallback(
    (change: (current: SearchHistoryRecord[]) => SearchHistoryRecord[]) => {
      if (active.current !== memory) return;
      const next = change(read());
      memory.records = next;
      setHistory(next);
      try {
        if (next.length)
          memory.storage?.setItem(memory.storageKey, JSON.stringify(next));
        else memory.storage?.removeItem(memory.storageKey);
        memory.dirty = false;
        if (storage && typeof window !== 'undefined')
          window.dispatchEvent(
            new window.CustomEvent(eventName, {
              detail: { key: storageKey, storage },
            })
          );
      } catch (error) {
        memory.dirty = true;
        notifyError(error);
      }
    },
    [read, storage, storageKey, memory, setHistory, notifyError]
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
