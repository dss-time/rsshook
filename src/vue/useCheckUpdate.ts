import { onMounted, onUnmounted, ref } from 'vue';

export interface UseCheckUpdateOptions {
  interval?: number;
  storageKey?: string;
  getVersion?: () => Promise<string | null>;
}

const DEFAULT_INTERVAL = 60 * 60 * 1000;
const DEFAULT_STORAGE_KEY = 'rsshook:version';

const defaultGetVersion = async () => {
  const response = await fetch(window.location.origin, {
    cache: 'no-cache',
  });

  return response.headers.get('etag') || response.headers.get('last-modified');
};

export default function useCheckUpdate(options: UseCheckUpdateOptions = {}) {
  const {
    interval = DEFAULT_INTERVAL,
    storageKey = DEFAULT_STORAGE_KEY,
    getVersion = defaultGetVersion,
  } = options;

  const hasUpdate = ref(false);
  const latestVersion = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  const checkUpdate = async () => {
    if (typeof window === 'undefined') return;

    const version = await getVersion();
    if (!version) return;

    const previousVersion = window.localStorage.getItem(storageKey);

    if (!previousVersion) {
      window.localStorage.setItem(storageKey, version);
      return;
    }

    latestVersion.value = version;
    hasUpdate.value = version !== previousVersion;
  };

  const refresh = () => {
    if (latestVersion.value) {
      window.localStorage.setItem(storageKey, latestVersion.value);
    }
    window.location.reload();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkUpdate();
    }
  };

  onMounted(() => {
    checkUpdate();
    timer = setInterval(checkUpdate, interval);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkUpdate);
  });

  onUnmounted(() => {
    if (timer) {
      clearInterval(timer);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', checkUpdate);
  });

  return {
    hasUpdate,
    latestVersion,
    checkUpdate,
    refresh,
  };
}
