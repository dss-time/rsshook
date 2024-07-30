import { useEffect, useState } from "react";

//浏览器检测
const browsers = new Map([
  ["360 Browser", /Qihu|360EE|360SE/],
  ["IE", /MSIE ([0-9]+[\.0-9]*)/],
  ["IE", /Trident.*rv:([0-9]+[\.0-9]*)/],
  ["Edge", /Edge\/([0-9]+[\.0-9]*)/],
  ["Firefox", /Firefox\/([0-9]+[\.0-9]*)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/([0-9]+[\.0-9]*)/],
  ["Safari", /Version\/([0-9]+[\.0-9]*).+?Safari\//],
  ["Opera", /Opera\/([0-9]+[\.0-9]*)/],
  ["OPR", /OPR\/([0-9]+[\.0-9]*)/],
  ["UCBrowser", /UCBrowser\/([0-9]+[\.0-9]*)/],
]);

// 设备检测
const devices = new Map([
  ["Desktop", /(Win|Mac|Mint|Ubuntu|Fedora|Debian|SuSE)/],
  ["Linux", /Linux/],
  ["Android", /Android/],
  ["iOS", /(iPhone|iPad|iPod)/],
]);

// 检测函数
const getMatch = (userAgent: any, rules: any) => {
  for (const [type, regex] of rules) {
    const match = userAgent.match(regex);
    if (match !== null) {
      return { type, version: match[1] || "unknown" };
    }
  }
  return { type: "unknown", version: "unknown" };
};

const useBrowserInfo = () => {
  const [info, setInfo] = useState({});

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    let match = getMatch(userAgent, browsers);
    if (match.type === "Chrome" && /Qihu|360EE|360SE/.test(userAgent)) {
      match.type = "360 Browser";
    }
    const deviceMatch = getMatch(userAgent, devices);
    setInfo({
      browserType: match.type,
      browserVersion: match.version,
      deviceType: deviceMatch.type,
      isMobileDevice: deviceMatch.type !== "Desktop",
      isDesktop: deviceMatch.type === "Desktop",
    });
  }, []);

  return info;
};

export default useBrowserInfo;
