import { useState, useEffect } from "react";

type MobileStyle = {
  mobileWidth: string;
  mobileHeight: string;
};

const useMobileStyle = (): MobileStyle => {
  const [mobileStyle, setMobileStyle] = useState<MobileStyle>({
    mobileWidth: "",
    mobileHeight: "",
  });

  useEffect(() => {
    const mobileAgents = [
      "Android",
      "iPhone",
      "SymbianOS",
      "Windows Phone",
      "iPad",
      "iPod",
      "HarmonyOS",
    ];
    const userAgentInfo = navigator.userAgent;
    const isMobile = mobileAgents.some(agent => userAgentInfo.includes(agent));
    if (isMobile) {
      setMobileStyle({ mobileWidth: "100vmax", mobileHeight: "100vmin" });
    }
  }, []);

  return mobileStyle;
};

export default useMobileStyle;
