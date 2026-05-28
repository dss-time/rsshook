import { useEffect, useState, type RefObject } from 'react';

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
export interface ScrollBoundaryState {
  isTop: boolean;
  isBottom: boolean;
  isLeft: boolean;
  isRight: boolean;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

const DEFAULT_STATE: ScrollBoundaryState = {
  isTop: true,
  isBottom: true,
  isLeft: true,
  isRight: true,
  scrollTop: 0,
  scrollLeft: 0,
  scrollHeight: 0,
  scrollWidth: 0,
  clientHeight: 0,
  clientWidth: 0,
};

const isSameState = (prev: ScrollBoundaryState, next: ScrollBoundaryState) =>
  prev.isTop === next.isTop &&
  prev.isBottom === next.isBottom &&
  prev.isLeft === next.isLeft &&
  prev.isRight === next.isRight &&
  prev.scrollTop === next.scrollTop &&
  prev.scrollLeft === next.scrollLeft &&
  prev.scrollHeight === next.scrollHeight &&
  prev.scrollWidth === next.scrollWidth &&
  prev.clientHeight === next.clientHeight &&
  prev.clientWidth === next.clientWidth;

const getWindowState = (threshold: number): ScrollBoundaryState => {
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
  const scrollLeft = window.scrollX || doc.scrollLeft || body.scrollLeft || 0;
  const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
  const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
  const clientHeight = window.innerHeight || doc.clientHeight;
  const clientWidth = window.innerWidth || doc.clientWidth;

  return {
    isTop: scrollTop <= threshold,
    isBottom: scrollTop + clientHeight >= scrollHeight - threshold,
    isLeft: scrollLeft <= threshold,
    isRight: scrollLeft + clientWidth >= scrollWidth - threshold,
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
  };
};

const getElementState = (
  element: HTMLElement,
  threshold: number
): ScrollBoundaryState => {
  const {
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
  } = element;

  return {
    isTop: scrollTop <= threshold,
    isBottom: scrollTop + clientHeight >= scrollHeight - threshold,
    isLeft: scrollLeft <= threshold,
    isRight: scrollLeft + clientWidth >= scrollWidth - threshold,
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
  };
};

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
  const [state, setState] = useState<ScrollBoundaryState>(DEFAULT_STATE);

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
          ? getWindowState(threshold)
          : getElementState(scrollTarget as HTMLElement, threshold);

      setState(prevState =>
        isSameState(prevState, nextState) ? prevState : nextState
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
