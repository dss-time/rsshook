import { onMounted, onUnmounted, ref, unref, type Ref } from 'vue';
import { readElementSize } from '../../shared/dom';
import type { MaybeRef } from './useScrollBoundary';

export type { MaybeRef } from './useScrollBoundary';

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
 * Element size refs.
 */
export interface ElementSize {
  width: Ref<number>;
  height: Ref<number>;
}

/**
 * Observe element size changes with debounced stable updates.
 *
 * @param target Element target.
 * @param options Size observation options.
 * @returns Current element size refs.
 */
export function useElementSizeStable(
  target: MaybeRef<HTMLElement | null>,
  options: UseElementSizeStableOptions = {}
): ElementSize {
  const { debounce = 100, immediate = true } = options;
  const width = ref(0);
  const height = ref(0);
  let cleanup: (() => void) | undefined;

  onMounted(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const element = unref(target);

    if (!element) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;

    const commitSize = () => {
      const nextSize = readElementSize(element);

      if (width.value !== nextSize.width) {
        width.value = nextSize.width;
      }

      if (height.value !== nextSize.height) {
        height.value = nextSize.height;
      }
    };

    const scheduleUpdate = () => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(commitSize, debounce);
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

    cleanup = () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);

      if (timer) {
        clearTimeout(timer);
      }
    };
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return {
    width,
    height,
  };
}

/**
 * @example
 * const elRef = ref<HTMLElement | null>(null);
 *
 * const size = useElementSizeStable(elRef, {
 *   debounce: 100,
 *   immediate: true,
 * });
 */
