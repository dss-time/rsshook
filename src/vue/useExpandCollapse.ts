import { computed, isRef, ref, type Ref } from 'vue';

const getValue = <T>(value: Ref<T> | T): T => (isRef(value) ? value.value : value);

export default function useExpandCollapse(
  content: Ref<string> | string,
  maxLength: Ref<number> | number
) {
  const isExpanded = ref(false);
  const text = computed(() => getValue(content));
  const shouldHideControl = computed(() => text.value.length <= getValue(maxLength));
  const isCollapsed = computed(
    () => text.value.length > getValue(maxLength) && !isExpanded.value
  );
  const toggleContent = computed(() =>
    isCollapsed.value ? `${text.value.substring(0, getValue(maxLength))}...` : text.value
  );

  const toggleVisibility = () => {
    isExpanded.value = !isExpanded.value;
  };

  return {
    toggleContent,
    toggleVisibility,
    shouldHideControl,
    isCollapsed,
    text,
  };
}

export { useExpandCollapse };
