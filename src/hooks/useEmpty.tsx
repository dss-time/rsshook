import { useMemo } from "react";
/**
@example 为空时返回true，否则返回false(Returns true if empty, otherwise returns false)

@param value 为必传参数，根据value的值返回true或false(It is a required parameter and returns true or false according to the value.)
*/

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
