// @ts-nocheck

import { message } from "antd";

//百度地图的加载器，需要在html中的header中引入脚本文件加上申请的百度地图的key
const BMapModule = (() => {
  let map = null;
  /**
   * 坐标常量说明：
   * COORDINATES_WGS84 = 1, WGS84坐标
   * COORDINATES_WGS84_MC = 2, WGS84的平面墨卡托坐标
   * COORDINATES_GCJ02 = 3，GCJ02坐标
   * COORDINATES_GCJ02_MC = 4, GCJ02的平面墨卡托坐标
   * COORDINATES_BD09 = 5, 百度bd09经纬度坐标
   * COORDINATES_BD09_MC = 6，百度bd09墨卡托坐标
   * COORDINATES_MAPBAR = 7，mapbar地图坐标
   * COORDINATES_51 = 8，51地图坐标
   */

  //私有函数，模块内部使用
  const _bmapConvert = point => {
    const translateCallback = data => {
      if (data.status === 0) {
        const marker = new BMap.Marker(data.points[0]);
        map.addOverlay(marker);
        map.setCenter(data.points[0]);
      }
    };

    setTimeout(() => {
      const convertor = new BMap.Convertor();
      const pointArr = [point];
      convertor.translate(pointArr, 3, 5, translateCallback);
    }, 500);
  };
  //私有函数，模块内部使用
  const _isOnline = () => {
    if (!navigator.onLine) {
      message.error("无网络连接，请检查您的网络");
      return false;
    }
    return true;
  };
  //对外使用可以被外部引用
  /**
   * @param {ReactNode}  id  dom的id
   * @param {string} lng -经度
   * @param {string} lat - 纬度
   */
  const initializeMap = (id, lng, lat) => {
    if (!_isOnline()) return;

    const BMap = window.BMap;
    map = new BMap.Map(id);
    const point = new BMap.Point(lng, lat);
    map.centerAndZoom(point, 15);
    map.enableScrollWheelZoom(true);

    _bmapConvert(point);
  };

  //对外使用可以被外部引用
  /**
   * @explain  销毁函数直接调用
   */
  const destroyMap = () => {
    if (map) {
      map.clearOverlays();
      map.reset();
      map = null;
    }
  };

  return {
    initializeMap,
    destroyMap,
  };
})();

export { BMapModule };
