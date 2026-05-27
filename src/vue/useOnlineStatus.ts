import { onMounted, onUnmounted, ref } from 'vue';

const getOnlineStatus = () =>
  typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;

export default function useOnlineStatus() {
  const status = ref(getOnlineStatus());
  const setOnline = () => {
    status.value = true;
  };
  const setOffline = () => {
    status.value = false;
  };

  onMounted(() => {
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
  });

  onUnmounted(() => {
    window.removeEventListener('online', setOnline);
    window.removeEventListener('offline', setOffline);
  });

  return status;
}
