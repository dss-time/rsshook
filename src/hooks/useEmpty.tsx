import { useMemo } from "react";
/**
@example 为空时返回true，否则返回false(Returns true if empty, otherwise returns false)

@param value 为必传参数，根据value的值返回true或false(It is a required parameter and returns true or false according to the value.)
*/

const useIsEmpty = (value: any): boolean => {
  return useMemo(() => {
    if (value === null || value === undefined) return true;

    const valueType = typeof value;

    if (valueType === "boolean") return false;

    if (valueType === "number") return Number.isNaN(value);

    if (valueType === "bigint" || valueType === "symbol" || valueType === "function")
      return false;

    if (valueType === "string") return value.trim() === "";

    if (Array.isArray(value)) return value.length === 0;

    if (value instanceof Date) return isNaN(value.getTime());

    if (value instanceof RegExp) return value.source === "(?:)";

    if (value instanceof Map || value instanceof Set) return value.size === 0;

    if (valueType === "object") {
      return Object.keys(value).length === 0;
    }

    return false;
  }, [value]);
};

export default useIsEmpty;
