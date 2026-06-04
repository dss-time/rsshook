export interface ScrollBoundarySnapshot {
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

export interface ElementSizeSnapshot {
  width: number;
  height: number;
}

export const DEFAULT_SCROLL_BOUNDARY_SNAPSHOT: ScrollBoundarySnapshot = {
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

export const DEFAULT_ELEMENT_SIZE: ElementSizeSnapshot = {
  width: 0,
  height: 0,
};

export const isSameScrollBoundarySnapshot = (
  prev: ScrollBoundarySnapshot,
  next: ScrollBoundarySnapshot
) =>
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

export const isSameElementSize = (
  prev: ElementSizeSnapshot,
  next: ElementSizeSnapshot
) => prev.width === next.width && prev.height === next.height;

export const readWindowScrollBoundary = (
  threshold: number
): ScrollBoundarySnapshot => {
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

export const readElementScrollBoundary = (
  element: HTMLElement,
  threshold: number
): ScrollBoundarySnapshot => {
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

export const readElementSize = (
  element: HTMLElement
): ElementSizeSnapshot => ({
  width: element.offsetWidth,
  height: element.offsetHeight,
});

export const readStickyState = (
  element: HTMLElement,
  top: number,
  root?: HTMLElement | null
) => {
  const rect = element.getBoundingClientRect();
  const rootTop = root ? root.getBoundingClientRect().top : 0;

  return rect.top <= rootTop + top;
};
