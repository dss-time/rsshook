import { onMounted, ref } from 'vue';
import { BrowserInfo, getBrowserInfo } from '../core/browserInfo';

export default function useBrowserInfo() {
  const info = ref<Partial<BrowserInfo>>({});

  onMounted(() => {
    info.value = getBrowserInfo(window.navigator.userAgent);
  });

  return info;
}
