import { useState, useEffect } from "react";
import { getMobileStyle, MobileStyle } from "../core/mobileStyle";

const useMobileStyle = (): MobileStyle => {
  const [mobileStyle, setMobileStyle] = useState<MobileStyle>({
    mobileWidth: "",
    mobileHeight: "",
  });

  useEffect(() => {
    setMobileStyle(getMobileStyle(navigator.userAgent));
  }, []);

  return mobileStyle;
};

export default useMobileStyle;
