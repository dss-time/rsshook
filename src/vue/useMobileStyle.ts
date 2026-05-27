import { onMounted, ref } from 'vue';
import { MobileStyle, getMobileStyle } from '../core/mobileStyle';

export default function useMobileStyle() {
  const mobileStyle = ref<MobileStyle>({
    mobileWidth: '',
    mobileHeight: '',
  });

  onMounted(() => {
    mobileStyle.value = getMobileStyle(navigator.userAgent);
  });

  return mobileStyle;
}
