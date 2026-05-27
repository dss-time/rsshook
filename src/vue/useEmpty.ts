import { computed, isRef, type ComputedRef, type Ref } from 'vue';
import { isEmpty } from '../core/isEmpty';

export default function useEmpty<T>(value: Ref<T> | T): ComputedRef<boolean> {
  return computed(() => isEmpty(isRef(value) ? value.value : value));
}

export { useEmpty };
export const useIsEmpty = useEmpty;
