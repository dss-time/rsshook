import { useEffect, useState, type RefObject } from 'react';
import { readStickyState } from '../../shared/dom';

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
  root?: HTMLElement | null;
}

/**
 * Current sticky state.
 */
export interface StickyState {
  isSticky: boolean;
}

/**
 * Detect whether an element has reached its sticky top position.
 *
 * @param ref Element ref.
 * @param options Sticky detection options.
 * @returns Current sticky state.
 */
export function useStickyState(
  ref: RefObject<HTMLElement | null>,
  options: UseStickyStateOptions = {}
): StickyState {
  const { top = 0, root = null } = options;
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const element = ref.current;

    if (!element) {
      return undefined;
    }

    let observer: IntersectionObserver | undefined;

    const update = () => {
      const nextValue = readStickyState(element, top, root);
      setIsSticky(prevValue => (prevValue === nextValue ? prevValue : nextValue));
    };

    update();

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(update, {
        root,
        rootMargin: `-${top}px 0px 0px 0px`,
        threshold: [0, 1],
      });
      observer.observe(element);
    } else {
      const scrollTarget = root || window;
      scrollTarget.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);

      return () => {
        scrollTarget.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      };
    }

    window.addEventListener('resize', update);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, root, top]);

  return { isSticky };
}

/**
 * @example
 * const ref = useRef<HTMLDivElement | null>(null);
 *
 * const { isSticky } = useStickyState(ref, {
 *   top: 0,
 * });
 */
