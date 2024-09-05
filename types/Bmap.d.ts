declare namespace BMap {
  type Animation = number;

  interface MapOptions {
    minZoom?: number;
    maxZoom?: number;
    mapType?: MapType;
    enableHighResolution?: boolean;
    enableAutoResize?: boolean;
    enableMapClick?: boolean;
  }

  enum MapType {
    NORMAL,
    PERSPECTIVE,
    SATELLITE,
    HYBRID,
  }

  interface ViewportOptions {
    enableAnimation?: boolean;
    margins?: number[];
    zoomFactor?: number;
    delay?: number;
  }

  interface IconOptions {
    anchor?: Size;
    imageOffset?: Size;
    infoWindowAnchor?: Size;
    printImageUrl?: string;
  }

  class Map {
    constructor(container: string | HTMLElement, opts?: MapOptions);
    centerAndZoom(center: Point | string, zoom: number): void;
    addOverlay(overlay: Overlay): void;
    removeOverlay(overlay: Overlay): void;
    clearOverlays(): void;
    setCenter(center: Point | string): void;
    getCenter(): Point;
    getZoom(): number;
    setZoom(zoom: number): void;
    addControl(control: Control): void;
    removeControl(control: Control): void;
    getContainer(): HTMLElement;
    setMapType(mapType: MapType): void;
    getMapType(): MapType;
    setViewport(view: Point[], viewportOptions?: ViewportOptions): void;
    enableScrollWheelZoom(enable: boolean): void;
    getBounds(): Bounds;
    getSize(): Size;
    setMaxZoom(zoom: number): void;
    setMinZoom(zoom: number): void;
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
  }

  const BMAP_ANIMATION_DROP: Animation;
  const BMAP_ANIMATION_BOUNCE: Animation;

  class Point {
    constructor(lng: number, lat: number);
    lng: number;
    lat: number;
  }

  interface Overlay {
    initialize(map: Map): HTMLElement | null;
    draw(): void;
    show(): void;
    hide(): void;
    isVisible(): boolean;
    setZIndex(zIndex: number): void;
    getZIndex(): number;
    setPosition(position: Point): void;
    getPosition(): Point;
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
  }

  class Marker implements Overlay {
    constructor(point: Point, opts?: MarkerOptions);
    setPosition(point: Point): void;
    getPosition(): Point;
    setIcon(icon: Icon): void;
    getIcon(): Icon;
    setLabel(label: Label): void;
    getLabel(): Label;
    setAnimation(animation: Animation | null): void;

    // 实现 Overlay 接口的方法
    initialize(map: Map): HTMLElement | null;
    draw(): void;
    show(): void;
    hide(): void;
    isVisible(): boolean;
    setZIndex(zIndex: number): void;
    getZIndex(): number;
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
  }

  interface MarkerOptions {
    offset?: Size;
    icon?: Icon;
    enableMassClear?: boolean;
    enableDragging?: boolean;
    enableClicking?: boolean;
    raiseOnDrag?: boolean;
    draggingCursor?: string;
    rotation?: number;
    shadow?: Icon;
    title?: string;
  }

  class Icon {
    constructor(url: string, size: Size, opts?: IconOptions);
    setImageUrl(imageUrl: string): void;
    setSize(size: Size): void;
    setImageSize(offset: Size): void;
    setAnchor(anchor: Size): void;
    setImageOffset(offset: Size): void;
  }

  class Size {
    constructor(width: number, height: number);
    width: number;
    height: number;
  }

  class Bounds {
    constructor(sw: Point, ne: Point);
    containsPoint(point: Point): boolean;
  }

  class Control {
    constructor(options?: ControlOptions);
    getContainer(): HTMLElement;
    setPosition(position: ControlPosition): void;
    getPosition(): ControlPosition;
    show(): void;
    hide(): void;
    isVisible(): boolean;
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
  }

  class Label implements Overlay {
    constructor(content: string, opts?: LabelOptions);
    setContent(content: string): void;
    setStyle(styles: object): void;
    setPosition(position: Point): void;
    getPosition(): Point;
    setOffset(offset: Size): void;
    getOffset(): Size;

    // 实现 Overlay 接口的方法
    initialize(map: Map): HTMLElement | null;
    draw(): void;
    show(): void;
    hide(): void;
    isVisible(): boolean;
    setZIndex(zIndex: number): void;
    getZIndex(): number;
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
  }

  interface LabelOptions {
    offset?: Size;
    position?: Point;
    enableMassClear?: boolean;
  }

  interface ControlOptions {
    anchor?: ControlAnchor;
    offset?: Size;
  }

  enum ControlAnchor {
    BMAP_ANCHOR_TOP_LEFT,
    BMAP_ANCHOR_TOP_RIGHT,
    BMAP_ANCHOR_BOTTOM_LEFT,
    BMAP_ANCHOR_BOTTOM_RIGHT,
  }

  enum ControlPosition {
    BMAP_CONTROL_POSITION_TOP_LEFT,
    BMAP_CONTROL_POSITION_TOP_RIGHT,
    BMAP_CONTROL_POSITION_BOTTOM_LEFT,
    BMAP_CONTROL_POSITION_BOTTOM_RIGHT,
  }

  class Convertor {
    translate(
      points: Point[],
      from: number,
      to: number,
      callback: (result: { status: number; points: Point[] }) => void
    ): void;
  }
}

declare namespace BMapLib {
  class MarkerClusterer {
    constructor(map: BMap.Map, options?: MarkerClustererOptions);
    addMarkers(markers: BMap.Marker[]): void;
    removeMarkers(markers: BMap.Marker[]): void;
    clearMarkers(): void;
  }

  interface MarkerClustererOptions {
    markers?: BMap.Marker[];
    girdSize?: number;
    maxZoom?: number;
    minClusterSize?: number;
    isAverangeCenter?: boolean;
    styles?: any[];
  }
}

declare const BMAP_ANIMATION_DROP: BMap.Animation;
declare const BMAP_ANIMATION_BOUNCE: BMap.Animation;

// export {};
// declare global {
//   interface Window {
//     BMap: typeof BMap;
//     BMapLib: typeof BMapLib;
//   }
// }

interface Window {
  BMap: typeof BMap;
  BMapLib: typeof BMapLib;
}
