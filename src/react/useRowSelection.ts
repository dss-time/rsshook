import { useCallback, useRef, useState } from 'react';
import { integer } from '../core/request/taskQueue';
export interface RowSelectionOptions<T, K extends string | number> {
  getKey: (row: T) => K;
  maxCount?: number;
}
/** Keys remain selected even when their records have not been loaded yet. */
export function useRowSelection<T, K extends string | number = string | number>(
  options: RowSelectionOptions<T, K>
) {
  const latest = useRef(options);
  latest.current = options;
  if (options.maxCount !== undefined) integer(options.maxCount, 'maxCount');
  const current = useRef<{ keys: K[]; records: Map<K, T> }>({
    keys: [],
    records: new Map(),
  });
  const [state, setState] = useState(current.current);
  const update = useCallback((keys: readonly K[], rows: readonly T[] = []) => {
    const unique = [...new Set(keys)];
    const { maxCount, getKey } = latest.current;
    if (maxCount !== undefined && unique.length > maxCount)
      throw new RangeError(`Selection exceeds ${maxCount} rows`);
    const available = new Map(current.current.records);
    for (const row of rows) available.set(getKey(row), row);
    const records = new Map<K, T>();
    for (const key of unique)
      if (available.has(key)) records.set(key, available.get(key)!);
    current.current = { keys: unique, records };
    setState(current.current);
  }, []);
  const refresh = useCallback(
    (rows: readonly T[]) => update(current.current.keys, rows),
    [update]
  );
  const clear = useCallback(() => update([]), [update]);
  return {
    selectedKeys: state.keys,
    selectedRows: [...state.records.values()],
    missingKeys: state.keys.filter(key => !state.records.has(key)),
    update,
    refresh,
    clear,
  };
}
