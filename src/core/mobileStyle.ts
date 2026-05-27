export interface MobileStyle {
  mobileWidth: string;
  mobileHeight: string;
}

const mobileAgents = [
  "Android",
  "iPhone",
  "SymbianOS",
  "Windows Phone",
  "iPad",
  "iPod",
  "HarmonyOS",
];

export const getMobileStyle = (userAgent = ""): MobileStyle => {
  const isMobile = mobileAgents.some(agent => userAgent.includes(agent));

  return isMobile
    ? { mobileWidth: "100vmax", mobileHeight: "100vmin" }
    : { mobileWidth: "", mobileHeight: "" };
};
