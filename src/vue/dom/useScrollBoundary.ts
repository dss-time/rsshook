import { onMounted, onUnmounted, ref, unref, type Ref } from 'vue';
import {
  readElementScrollBoundary,
  readWindowScrollBoundary,
  type ScrollBoundarySnapshot,
} from '../../shared/dom';

/**
 * Vue value or ref value.
 */
export type MaybeRef<T> = T | Ref<T>;

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
   * Detect boundaries on the element target or on window.
   *
   * @default "element"
   */
  target?: 'element' | 'window';
}

/**
 * Current scroll boundary refs.
 */
export interface ScrollBoundaryState {
  isTop: Ref<boolean>;
  isBottom: Ref<boolean>;
  isLeft: Ref<boolean>;
  isRight: Ref<boolean>;
  scrollTop: Ref<number>;
  scrollLeft: Ref<number>;
  scrollHeight: Ref<number>;
  scrollWidth: Ref<number>;
  clientHeight: Ref<number>;
  clientWidth: Ref<number>;
}

/**
 * Detect whether a scroll container has reached each scroll boundary.
 *
 * @param target Element target used when options.target is "element".
 * @param options Scroll boundary options.
 * @returns Current scroll boundary refs.
 */
export function useScrollBoundary(
  target?: MaybeRef<HTMLElement | null>,
  options: UseScrollBoundaryOptions = {}
): ScrollBoundaryState {
  const { threshold = 0, target: targetType = 'element' } = options;
  const isTop = ref(true);
  const isBottom = ref(true);
  const isLeft = ref(true);
  const isRight = ref(true);
  const scrollTop = ref(0);
  const scrollLeft = ref(0);
  const scrollHeight = ref(0);
  const scrollWidth = ref(0);
  const clientHeight = ref(0);
  const clientWidth = ref(0);
  let cleanup: (() => void) | undefined;

  const updateRefs = (state: ScrollBoundarySnapshot) => {
    if (isTop.value !== state.isTop) isTop.value = state.isTop;
    if (isBottom.value !== state.isBottom) isBottom.value = state.isBottom;
    if (isLeft.value !== state.isLeft) isLeft.value = state.isLeft;
    if (isRight.value !== state.isRight) isRight.value = state.isRight;
    if (scrollTop.value !== state.scrollTop) scrollTop.value = state.scrollTop;
    if (scrollLeft.value !== state.scrollLeft) scrollLeft.value = state.scrollLeft;
    if (scrollHeight.value !== state.scrollHeight) {
      scrollHeight.value = state.scrollHeight;
    }
    if (scrollWidth.value !== state.scrollWidth) {
      scrollWidth.value = state.scrollWidth;
    }
    if (clientHeight.value !== state.clientHeight) {
      clientHeight.value = state.clientHeight;
    }
    if (clientWidth.value !== state.clientWidth) clientWidth.value = state.clientWidth;
  };

  onMounted(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const scrollTarget =
      targetType === 'window' ? window : unref(target) || undefined;

    if (!scrollTarget) {
      return;
    }

    const update = () => {
      updateRefs(
        targetType === 'window'
          ? readWindowScrollBoundary(threshold)
          : readElementScrollBoundary(scrollTarget as HTMLElement, threshold)
      );
    };

    update();
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

  return {
    isTop,
    isBottom,
    isLeft,
    isRight,
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
  };
}

/**
 * @example
 * const elRef = ref<HTMLElement | null>(null);
 *
 * const boundary = useScrollBoundary(elRef, {
 *   threshold: 2,
 * });
 */
