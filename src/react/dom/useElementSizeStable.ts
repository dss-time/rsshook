import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  DEFAULT_ELEMENT_SIZE,
  isSameElementSize,
  readElementSize,
  type ElementSizeSnapshot,
} from '../../shared/dom';

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
export interface ElementSize extends ElementSizeSnapshot {}

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
  const [size, setSize] = useState<ElementSize>(DEFAULT_ELEMENT_SIZE);
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
      const nextSize = readElementSize(element);
      setSize(prevSize =>
        isSameElementSize(prevSize, nextSize) ? prevSize : nextSize
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
