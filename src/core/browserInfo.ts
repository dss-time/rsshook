export interface BrowserInfo {
  browserType: string;
  browserVersion: string;
  deviceType: string;
  isMobileDevice: boolean;
  isDesktop: boolean;
}

const browsers = new Map<string, RegExp>([
  ["360 Browser", /Qihu|360EE|360SE/],
  ["IE", /MSIE ([0-9]+[.0-9]*)/],
  ["IE", /Trident.*rv:([0-9]+[.0-9]*)/],
  ["Edge", /Edge\/([0-9]+[.0-9]*)/],
  ["Firefox", /Firefox\/([0-9]+[.0-9]*)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/([0-9]+[.0-9]*)/],
  ["Safari", /Version\/([0-9]+[.0-9]*).+?Safari\//],
  ["Opera", /Opera\/([0-9]+[.0-9]*)/],
  ["OPR", /OPR\/([0-9]+[.0-9]*)/],
  ["UCBrowser", /UCBrowser\/([0-9]+[.0-9]*)/],
]);

const devices = new Map<string, RegExp>([
  ["Desktop", /(Win|Mac|Mint|Ubuntu|Fedora|Debian|SuSE)/],
  ["Linux", /Linux/],
  ["Android", /Android/],
  ["iOS", /(iPhone|iPad|iPod)/],
]);

const getMatch = (userAgent: string, rules: Map<string, RegExp>) => {
  for (const [type, regex] of rules) {
    const match = userAgent.match(regex);
    if (match !== null) {
      return { type, version: match[1] || "unknown" };
    }
  }

  return { type: "unknown", version: "unknown" };
};

export const getBrowserInfo = (userAgent = ""): BrowserInfo => {
  let browserMatch = getMatch(userAgent, browsers);

  if (browserMatch.type === "Chrome" && /Qihu|360EE|360SE/.test(userAgent)) {
    browserMatch = { ...browserMatch, type: "360 Browser" };
  }

  const deviceMatch = getMatch(userAgent, devices);

  return {
    browserType: browserMatch.type,
    browserVersion: browserMatch.version,
    deviceType: deviceMatch.type,
    isMobileDevice: deviceMatch.type !== "Desktop",
    isDesktop: deviceMatch.type === "Desktop",
  };
};
