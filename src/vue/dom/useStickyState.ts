import { onMounted, onUnmounted, ref, unref, type Ref } from 'vue';
import { readStickyState } from '../../shared/dom';
import type { MaybeRef } from './useScrollBoundary';

export type { MaybeRef } from './useScrollBoundary';

/**
 * Options for detecting sticky state.
 */
export interface UseStickyStateOptions {
  /**
   * Top offset used by sticky positioning.
   *
   * @default 0
   */
  top?: number;
  /**
   * Scroll root container.
   */
  root?: MaybeRef<HTMLElement | null>;
}

/**
 * Current sticky state refs.
 */
export interface StickyState {
  isSticky: Ref<boolean>;
}

/**
 * Detect whether an element has reached its sticky top position.
 *
 * @param target Element target.
 * @param options Sticky detection options.
 * @returns Current sticky state refs.
 */
export function useStickyState(
  target: MaybeRef<HTMLElement | null>,
  options: UseStickyStateOptions = {}
): StickyState {
  const { top = 0, root = null } = options;
  const isSticky = ref(false);
  let cleanup: (() => void) | undefined;

  onMounted(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const element = unref(target);
    const rootElement = unref(root);

    if (!element) {
      return;
    }

    let observer: IntersectionObserver | undefined;

    const update = () => {
      const nextValue = readStickyState(element, top, rootElement);

      if (isSticky.value !== nextValue) {
        isSticky.value = nextValue;
      }
    };

    update();

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(update, {
        root: rootElement,
        rootMargin: `-${top}px 0px 0px 0px`,
        threshold: [0, 1],
      });
      observer.observe(element);
      window.addEventListener('resize', update);

      cleanup = () => {
        observer?.disconnect();
        window.removeEventListener('resize', update);
      };
      return;
    }

    const scrollTarget = rootElement || window;
    scrollTarget.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    cleanup = () => {
      scrollTarget.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return { isSticky };
}

/**
 * @example
 * const elRef = ref<HTMLElement | null>(null);
 *
 * const { isSticky } = useStickyState(elRef, {
 *   top: 0,
 * });
 */
