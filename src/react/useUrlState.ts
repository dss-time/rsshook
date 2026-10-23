import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { mergeQuery } from '../core/url/queryString';
export interface UrlWriteOptions {
  replace?: boolean;
}
export interface UrlStateAdapter {
  /** Returns the current query only, with or without leading ?. */
  getSearch(): string;
  /** Notify on external navigation, including back/forward. */
  subscribe(notify: () => void): () => void;
  /** Update getSearch synchronously and notify subscribers; preserve pathname/hash. */
  setSearch(search: string, options: { replace: boolean }): void;
}
export interface UrlField<T> {
  key?: string;
  defaultValue: T;
  /** Missing fields use defaultValue; throwing also falls back to it. */
  parse(values: string[]): T;
  serialize(value: T): readonly string[];
}
export type UrlStateSchema<T> = { [K in keyof T]-?: UrlField<T[K]> };
export interface UrlStateOptions extends UrlWriteOptions {
  /** Query used for SSR and the first hydration snapshot. */
  serverSearch?: string;
}
function schemaEntries<T extends object>(schema: UrlStateSchema<T>) {
  return Object.entries(schema) as [keyof T & string, UrlField<T[keyof T]>][];
}
function decode<T extends object>(
  schema: UrlStateSchema<T>,
  search: string
): T {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    schemaEntries(schema).map(([field, codec]) => {
      const values = params.getAll(codec.key ?? field);
      let value = codec.defaultValue;
      if (values.length) {
        try {
          value = codec.parse(values);
        } catch {
          /* Malformed URLs use the declared default. */
        }
      }
      return [field, value];
    })
  ) as T;
}
/** URL is the source of truth; no router imports or mirrored local state. */
export function useUrlState<T extends object>(
  schema: UrlStateSchema<T>,
  adapter: UrlStateAdapter,
  options: UrlStateOptions = {}
) {
  // Validate resolved keys too: aliases must not collide with unaliased fields.
  const resolvedKeys = schemaEntries(schema).map(
    ([field, codec]) => codec.key ?? field
  );
  if (
    resolvedKeys.some(key => key.length === 0) ||
    new Set(resolvedKeys).size !== resolvedKeys.length
  )
    throw new Error('URL field keys must be nonempty and unique');
  const latest = useRef({ schema, adapter, options });
  latest.current = { schema, adapter, options };
  const subscribe = useCallback(
    (notify: () => void) => adapter.subscribe(notify),
    [adapter]
  );
  const getSnapshot = useCallback(() => adapter.getSearch(), [adapter]);
  const search = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => options.serverSearch ?? ''
  );
  const state = useMemo(() => decode(schema, search), [schema, search]);
  const setState = useCallback(
    (
      patch: Partial<T> | ((current: Readonly<T>) => Partial<T>),
      write: UrlWriteOptions = {}
    ) => {
      const { schema, adapter, options } = latest.current;
      const search = adapter.getSearch();
      const changes =
        typeof patch === 'function' ? patch(decode(schema, search)) : patch;
      const entries = schemaEntries(schema);
      const values = Object.fromEntries(
        entries
          .filter(([field]) =>
            Object.prototype.hasOwnProperty.call(changes, field)
          )
          .map(([field, codec]) => [
            field,
            changes[field] === undefined
              ? []
              : codec.serialize(changes[field] as T[keyof T]),
          ])
      );
      if (Object.keys(values).length === 0) return;
      const mergeOptions = {
        fields: entries.map(([field]) => field),
        fieldMap: Object.fromEntries(
          entries.map(([field, codec]) => [field, codec.key ?? field])
        ),
      };
      const next = mergeQuery(
        search ? `?${search.replace(/^\?/, '')}` : '',
        values,
        mergeOptions
      );
      if (next !== (search ? `?${search.replace(/^\?/, '')}` : ''))
        adapter.setSearch(next, {
          replace: write.replace ?? options.replace ?? true,
        });
    },
    []
  );
  const reset = useCallback(
    (write?: UrlWriteOptions) => {
      setState(
        Object.fromEntries(
          Object.keys(latest.current.schema).map(field => [field, undefined])
        ) as Partial<T>,
        write
      );
    },
    [setState]
  );
  return { state, setState, reset };
}
