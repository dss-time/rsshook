declare namespace BMap {
  type Animation = number;
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

  class Marker implements Overlay {
    constructor(point: Point, opts?: MarkerOptions);
    setPosition(point: Point): void;
    getPosition(): Point;
    setIcon(icon: Icon): void;
    getIcon(): Icon;
    setLabel(label: Label): void;
    getLabel(): Label;
    setAnimation(animation: Animation | null): void;
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
    // 构造函数
    constructor(options?: ControlOptions);

    // 方法
    getContainer(): HTMLElement;
    setPosition(position: ControlPosition): void;
    getPosition(): ControlPosition;
    show(): void;
    hide(): void;
    isVisible(): boolean;

    // 事件
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
  }

  class Label extends Overlay {
    constructor(content: string, opts?: LabelOptions);
    setContent(content: string): void;
    setStyle(styles: object): void;
    setPosition(position: Point): void;
    getPosition(): Point;
    setOffset(offset: Size): void;
    getOffset(): Size;
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

  interface MarkerAnimation {}

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

  interface Overlay {
    // 初始化方法，当调用map.addOverlay时被调用
    initialize(map: Map): HTMLElement | null;
    // 绘制方法，当地图状态发生变化时被调用
    draw(): void;
    // 显示
    show(): void;
    // 隐藏
    hide(): void;
    // 是否可见
    isVisible(): boolean;
    // 设置叠加层的zIndex
    setZIndex(zIndex: number): void;
    // 获取叠加层的zIndex
    getZIndex(): number;
    // 设置叠加层的位置
    setPosition(position: Point): void;
    // 获取叠加层的位置
    getPosition(): Point;
    // 事件监听
    addEventListener(event: string, handler: Function): void;
    removeEventListener(event: string, handler: Function): void;
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
declare global {
  interface Window {
    BMap: typeof BMap;
    BMapLib: typeof BMapLib;
  }
}
