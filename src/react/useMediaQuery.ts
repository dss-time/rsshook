import { useCallback, useMemo, useSyncExternalStore } from 'react';
export interface MediaQueryOptions {
  /** Server snapshot and fallback when matchMedia is unavailable. */
  defaultMatches?: boolean;
}
/** Uses native media-query changes, without polling or resize handlers. */
export function useMediaQuery(
  query: string,
  options: MediaQueryOptions = {}
): boolean {
  const { defaultMatches = false } = options;
  const media = useMemo(
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query)
        : undefined,
    [query]
  );
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!media) return () => {};
      if (media.addEventListener) {
        media.addEventListener('change', notify);
        return () => media.removeEventListener('change', notify);
      }
      media.addListener(notify);
      return () => media.removeListener(notify);
    },
    [media]
  );
  return useSyncExternalStore(
    subscribe,
    () => media?.matches ?? defaultMatches,
    () => defaultMatches
  );
}
