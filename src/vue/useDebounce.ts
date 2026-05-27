import { Ref, isRef, ref, watch } from 'vue';

export default function useDebounce<T>(value: Ref<T>, delay: number): Ref<T>;
export default function useDebounce<T>(value: T, delay: number): Ref<T>;
export default function useDebounce<T>(value: Ref<T> | T, delay: number) {
  const debouncedValue = ref(isRef(value) ? value.value : value) as Ref<T>;

  if (isRef(value)) {
    watch(
      value,
      nextValue => {
        const timer = setTimeout(() => {
          debouncedValue.value = nextValue;
        }, delay);

        return () => clearTimeout(timer);
      },
      { immediate: true }
    );
  }

  return debouncedValue;
}
