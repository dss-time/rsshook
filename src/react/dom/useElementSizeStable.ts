import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Options for observing stable element size.
 */
export interface UseElementSizeStableOptions {
  /**
   * Debounce delay in milliseconds.
   *
   * @default 100
   */
  debounce?: number;
  /**
   * Read current size immediately on mount.
   *
   * @default true
   */
  immediate?: boolean;
}

/**
 * Element size.
 */
export interface ElementSize {
  width: number;
  height: number;
}

const DEFAULT_SIZE: ElementSize = {
  width: 0,
  height: 0,
};

const readSize = (element: HTMLElement): ElementSize => ({
  width: element.offsetWidth,
  height: element.offsetHeight,
});

/**
 * Observe element size changes with debounced stable updates.
 *
 * @param ref Element ref.
 * @param options Size observation options.
 * @returns Current element size.
 */
export function useElementSizeStable(
  ref: RefObject<HTMLElement | null>,
  options: UseElementSizeStableOptions = {}
): ElementSize {
  const { debounce = 100, immediate = true } = options;
  const [size, setSize] = useState<ElementSize>(DEFAULT_SIZE);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const element = ref.current;

    if (!element) {
      return undefined;
    }

    let observer: ResizeObserver | undefined;

    const commitSize = () => {
      const nextSize = readSize(element);
      setSize(prevSize =>
        prevSize.width === nextSize.width && prevSize.height === nextSize.height
          ? prevSize
          : nextSize
      );
    };

    const scheduleUpdate = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(commitSize, debounce);
    };

    if (immediate) {
      commitSize();
    }

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
    } else {
      window.addEventListener('resize', scheduleUpdate);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [ref, debounce, immediate]);

  return size;
}

/**
 * @example
 * const ref = useRef<HTMLDivElement | null>(null);
 *
 * const size = useElementSizeStable(ref, {
 *   debounce: 100,
 *   immediate: true,
 * });
 */
