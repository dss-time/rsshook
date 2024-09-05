import { message } from "antd";

const _isOnline = () => {
  if (!navigator.onLine) {
    message.error("无网络连接，请检查您的网络");
    return false;
  }
  return true;
};

const _bmapConvert = (point: any, map: any) => {
  const translateCallback = (data: { status: number; points: any[] }) => {
    if (data.status === 0) {
      map.setCenter(data.points[0]);
    }
  };

  setTimeout(() => {
    const convertor = new window.BMap.Convertor();
    const pointArr = [point];
    convertor.translate(pointArr, 3, 5, translateCallback);
  }, 300);
};

export { _isOnline, _bmapConvert };
