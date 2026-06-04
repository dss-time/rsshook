import { useEffect, useState, type RefObject } from 'react';
import {
  DEFAULT_SCROLL_BOUNDARY_SNAPSHOT,
  isSameScrollBoundarySnapshot,
  readElementScrollBoundary,
  readWindowScrollBoundary,
  type ScrollBoundarySnapshot,
} from '../../shared/dom';

/**
 * Options for detecting scroll boundaries.
 */
export interface UseScrollBoundaryOptions {
  /**
   * Distance in pixels from an edge that should count as reaching it.
   *
   * @default 0
   */
  threshold?: number;
  /**
   * Detect boundaries on the element ref or on window.
   *
   * @default "element"
   */
  target?: 'element' | 'window';
}

/**
 * Current scroll boundary state.
 */
export interface ScrollBoundaryState extends ScrollBoundarySnapshot {}

/**
 * Detect whether a scroll container has reached each scroll boundary.
 *
 * @param ref Element ref used when target is "element".
 * @param options Scroll boundary options.
 * @returns Current scroll boundary state.
 */
export function useScrollBoundary(
  ref?: RefObject<HTMLElement | null>,
  options: UseScrollBoundaryOptions = {}
): ScrollBoundaryState {
  const { threshold = 0, target = 'element' } = options;
  const [state, setState] = useState<ScrollBoundaryState>(
    DEFAULT_SCROLL_BOUNDARY_SNAPSHOT
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const scrollTarget = target === 'window' ? window : ref?.current;

    if (!scrollTarget) {
      return undefined;
    }

    const update = () => {
      const nextState =
        target === 'window'
          ? readWindowScrollBoundary(threshold)
          : readElementScrollBoundary(scrollTarget as HTMLElement, threshold);

      setState(prevState =>
        isSameScrollBoundarySnapshot(prevState, nextState)
          ? prevState
          : nextState
      );
    };

    update();
    scrollTarget.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      scrollTarget.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, target, threshold]);

  return state;
}

/**
 * @example
 * const ref = useRef<HTMLDivElement | null>(null);
 *
 * const boundary = useScrollBoundary(ref, {
 *   threshold: 2,
 * });
 */
