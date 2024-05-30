const { useMemo } = require("react");

const useIsEmpty = (value: any): boolean => {
  return useMemo(() => {
    if (value === false) return false;

    if (value === null || value === undefined) return true;

    if (typeof value === "string") return value.trim() === "";

    if (Array.isArray(value)) return value.length === 0;

    if (value instanceof Date) return isNaN(value.getTime());

    if (value instanceof RegExp) return value.source === "(?:)";

    if (value instanceof Map || value instanceof Set) return value.size === 0;

    if (typeof value === "object") {
      return Object.keys(value).constructor !== Object
        ? Object.keys(value).length === 0
        : Object.keys(value).length === 0;
    }

    return true;
  }, [value]);
};

export default useIsEmpty;
