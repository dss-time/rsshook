export const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;

  const valueType = typeof value;

  if (valueType === "boolean") return false;
  if (valueType === "number") return Number.isNaN(value);
  if (valueType === "bigint" || valueType === "symbol" || valueType === "function") {
    return false;
  }
  if (valueType === "string") return (value as string).trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Date) return isNaN(value.getTime());
  if (value instanceof RegExp) return value.source === "(?:)";
  if (value instanceof Map || value instanceof Set) return value.size === 0;

  if (valueType === "object") {
    return Object.keys(value as object).length === 0;
  }

  return false;
};
