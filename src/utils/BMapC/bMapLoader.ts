import debounce from "lodash/debounce";
// import onlineBatteryIcon from "@/static/img/online_battery.svg";
// import offlineBatteryIcon from "@/static/img/offline_battery.svg";
// import onlineForkliftIcon from "@/static/img/online_forklift.svg";
// import offlineForkliftIcon from "@/static/img/offline_forklift.svg";
import QuadTreeNode from "./quadTreeNode";
import { _isOnline, _bmapConvert } from "./mapUtils";

const BMapModule = (() => {
  let map: any = null;
  let quadTree: QuadTreeNode | null = null;
  let worker: Worker | null = null;
  let activeMarkersMap: Map<string, any> = new Map();
  let clickListener: ((point: any) => void) | null = null;
  let currentFilter: "all" | "online" | "offline" = "all";
  let selectedMarker: any = null;

  const clearSelectedMarker = () => {
    if (selectedMarker) {
      selectedMarker = null;
    }
  };

  const filterMarkers = (filter: "all" | "online" | "offline") => {
    currentFilter = filter;
    loadMarkersInView();
  };

  const addClickListener = (listener: (point: any) => void) => {
    clickListener = listener;
  };

  const updateMarkerClickEvent = (marker: any, cluster: any) => {
    marker.removeEventListener("click");
    marker.addEventListener("click", function () {
      if (cluster.count > 1) {
        const zoomLevel = map.getZoom();
        map.centerAndZoom(
          new BMap.Point(cluster.lng, cluster.lat),
          Math.min(zoomLevel + 1, 18)
        );
      } else if (clickListener && cluster.data && cluster.data.length > 0) {
        clearSelectedMarker();
        selectedMarker = marker;
        clickListener(cluster.data[0]);
      }
    });
  };

  const clearAllMarkers = () => {
    Array.from(activeMarkersMap.values()).forEach(marker => {
      map.removeOverlay(marker);
    });
    activeMarkersMap.clear();
  };

  const initializeMap = (container: HTMLElement, lng: number, lat: number) => {
    if (!_isOnline()) return;

    const BMap = window.BMap;
    map = new BMap.Map(container);
    const point = new BMap.Point(lng, lat);
    map.centerAndZoom(point, 15);
    map.enableScrollWheelZoom(true);
    map.setMaxZoom(20);
    map.setMinZoom(5);

    _bmapConvert(point, map);
    worker = createWorker();
    worker.onmessage = (e: MessageEvent) => {
      updateMarkers(e.data);
    };

    map.addEventListener("zoomend", debounce(loadMarkersInView, 500));
    map.addEventListener("moveend", debounce(loadMarkersInView, 500));
    // loadMarkersInView();
  };

  const locateMarker = (points: string) => {
    if (!map || !quadTree) return;
    const allPoints = quadTree.query({
      minX: -180,
      minY: -90,
      maxX: 180,
      maxY: 90,
    });
    const targetPoint = allPoints.find(
      point =>
        point.data && (point.data.vin === points || point.data.dis === points)
    );

    if (targetPoint) {
      const point = new BMap.Point(targetPoint.lng, targetPoint.lat);
      map.centerAndZoom(point, 18);
    }
  };

  const addMarkers = (points: any[]) => {
    if (!map) return;
    clearAllMarkers();
    quadTree = new QuadTreeNode({ minX: -180, minY: -90, maxX: 180, maxY: 90 });

    for (const point of points) {
      const inserted = quadTree.insert({
        lng: point.lnglat[0],
        lat: point.lnglat[1],
        data: point,
      });
      if (!inserted) {
        console.warn("超出最大界限，请调整最大界限的值:", point);
      }
    }

    loadMarkersInView();
  };

  const loadMarkersInView = () => {
    if (!map || !quadTree || !worker) return;

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    let visiblePoints = quadTree.query({
      minX: sw.lng,
      minY: sw.lat,
      maxX: ne.lng,
      maxY: ne.lat,
    });

    if (currentFilter !== "all") {
      visiblePoints = visiblePoints.filter(
        point =>
          point.data &&
          (currentFilter === "online"
            ? point.data.style === 1
            : point.data.style === 2)
      );
    }
    const filteredPoints = visiblePoints.filter(
      (_, index) => index % Math.ceil(visiblePoints.length / 10000) === 0
    );

    worker.postMessage({ points: filteredPoints, zoom: map.getZoom() });
  };

  const createIcon = (cluster: any): any => {
    let iconUrl: any;
    if (cluster.count > 1) {
      if (cluster.data && cluster.data[0].vin) {
        iconUrl =
          "http://api.map.baidu.com/library/TextIconOverlay/1.2/src/images/m3.png";
      } else if (cluster.data && cluster.data[0].dis) {
        iconUrl =
          "https://api.map.baidu.com/library/TextIconOverlay/1.2/src/images/m0.png";
      }
      const size = new BMap.Size(53, 53);
      return new BMap.Icon(iconUrl, size, {
        imageSize: size,
        imageOffset: new BMap.Size(0, 0),
      });
    } else {
      if (cluster.data && cluster.data[0].vin) {
        iconUrl =
          cluster.data[0].style === 1 ? onlineBatteryIcon : offlineBatteryIcon;
      } else if (cluster.data && cluster.data[0].dis) {
        iconUrl =
          cluster.data[0].style === 1
            ? onlineForkliftIcon
            : offlineForkliftIcon;
      }
      return new BMap.Icon(iconUrl, new BMap.Size(35, 35));
    }
  };

  const updateMarkers = (clusters: any[]) => {
    const newActiveMarkersMap: Map<string, any> = new Map();
    clusters.forEach(cluster => {
      const markerId = `${cluster.lng},${cluster.lat}`;
      let marker;
      const icon = createIcon(cluster);
      if (activeMarkersMap.has(markerId)) {
        marker = activeMarkersMap.get(markerId);
        updateExistingMarker(marker, cluster, icon);
      } else {
        marker = createNewMarker(cluster, icon);
      }
      newActiveMarkersMap.set(markerId, marker);
    });

    activeMarkersMap.forEach((marker, markerId) => {
      if (!newActiveMarkersMap.has(markerId)) {
        map.removeOverlay(marker);
      }
    });

    activeMarkersMap = newActiveMarkersMap;
  };

  const updateExistingMarker = (marker: any, cluster: any, icon: any) => {
    marker.setPosition(new BMap.Point(cluster.lng, cluster.lat));
    marker.setIcon(icon);
    updateMarkerLabel(marker, cluster);
    updateMarkerClickEvent(marker, cluster);
  };

  const createNewMarker = (cluster: any, icon: any) => {
    const marker = new BMap.Marker(new BMap.Point(cluster.lng, cluster.lat), {
      icon: icon,
    });
    updateMarkerLabel(marker, cluster);
    updateMarkerClickEvent(marker, cluster);
    map.addOverlay(marker);
    return marker;
  };

  const updateMarkerLabel = (marker: any, cluster: any) => {
    if (cluster.count > 1) {
      const label = new BMap.Label(cluster.count.toString(), {
        offset: new BMap.Size(0, 0),
      });
      label.setStyle({
        border: "none",
        backgroundColor: "transparent",
        color: "#fff",
        fontSize: "14px",
        fontWeight: "bold",
        textAlign: "center",
        lineHeight: "53px",
        width: "53px",
      });
      marker.setLabel(label);
    } else {
      marker.setLabel(null);
    }
  };

  const destroyMap = () => {
    if (map) {
      map.clearOverlays();
      map = null;
    }
    quadTree = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const createWorker = () => {
    const workerCode = `
      self.onmessage = function(e) {
        const { points, zoom } = e.data;
        const clusters = clusterPoints(points, zoom);
        self.postMessage(clusters);
      };

      function clusterPoints(points, zoom) {
        const clusters = [];
        const gridSize = 50 / Math.pow(2, zoom - 3);  // 根据缩放级别调整网格大小

        const grid = {};
        for (const point of points) {
          const gridKey = Math.floor(point.lng / gridSize) + ',' + Math.floor(point.lat / gridSize);
          if (!grid[gridKey]) {
            grid[gridKey] = { lng: point.lng, lat: point.lat, count: 1, data: [point.data] };
            clusters.push(grid[gridKey]);
          } else {
            grid[gridKey].count++;
            grid[gridKey].data.push(point.data);
            grid[gridKey].lng = (grid[gridKey].lng * (grid[gridKey].count - 1) + point.lng) / grid[gridKey].count;
            grid[gridKey].lat = (grid[gridKey].lat * (grid[gridKey].count - 1) + point.lat) / grid[gridKey].count;
          }
        }

        return clusters;
      }
    `;

    const blob = new Blob([workerCode], { type: "application/javascript" });
    return new Worker(URL.createObjectURL(blob));
  };

  return {
    initializeMap,
    destroyMap,
    addMarkers,
    addClickListener,
    filterMarkers,
    clearSelectedMarker,
    locateMarker,
  };
})();

export { BMapModule };
