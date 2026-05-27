import { useEffect, useState } from "react";
import { BrowserInfo, getBrowserInfo } from "../core/browserInfo";

const useBrowserInfo = () => {
  const [info, setInfo] = useState<Partial<BrowserInfo>>({});

  useEffect(() => {
    setInfo(getBrowserInfo(window.navigator.userAgent));
  }, []);

  return info;
};

export default useBrowserInfo;
