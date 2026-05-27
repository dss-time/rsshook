import { useMemo } from "react";
import { isEmpty } from "../core/isEmpty";
/**
@example 为空时返回true，否则返回false(Returns true if empty, otherwise returns false)

@param value 为必传参数，根据value的值返回true或false(It is a required parameter and returns true or false according to the value.)
*/

const useIsEmpty = (value: unknown): boolean => {
  return useMemo(() => isEmpty(value), [value]);
};

export default useIsEmpty;
