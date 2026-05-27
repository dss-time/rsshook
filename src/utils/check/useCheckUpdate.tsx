import { Button, notification } from 'antd';
import { useCallback, useEffect, useRef } from 'react';

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

const useCheckUpdate = (options: UseCheckUpdateOptions = {}) => {
  const {
    interval = DEFAULT_INTERVAL,
    storageKey = DEFAULT_STORAGE_KEY,
    getVersion = defaultGetVersion,
  } = options;

  const timer = useRef<ReturnType<typeof setInterval>>();
  const notificationVisible = useRef(false);

  const close = useCallback(() => {
    notificationVisible.current = false;
  }, []);

  const refresh = useCallback(
    (version: string) => {
      close();
      window.localStorage.setItem(storageKey, version);
      window.location.reload();
    },
    [close, storageKey]
  );

  const openNotification = useCallback(
    (version: string) => {
      notificationVisible.current = true;

      notification.open({
        message: '版本更新提示',
        description: '检测到系统当前版本已更新，请刷新后使用。',
        btn: (
          <Button type="primary" size="small" onClick={() => refresh(version)}>
            确认更新
          </Button>
        ),
        duration: 0,
        onClose: close,
      });
    },
    [close, refresh]
  );

  const checkUpdate = useCallback(async () => {
    if (notificationVisible.current || typeof window === 'undefined') {
      return;
    }

    const version = await getVersion();
    if (!version) return;

    const previousVersion = window.localStorage.getItem(storageKey);

    if (!previousVersion) {
      window.localStorage.setItem(storageKey, version);
      return;
    }

    if (version !== previousVersion) {
      openNotification(version);
    }
  }, [getVersion, openNotification, storageKey]);

  useEffect(() => {
    checkUpdate();
    timer.current = setInterval(checkUpdate, interval);

    return () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
    };
  }, [checkUpdate, interval]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkUpdate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkUpdate);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkUpdate);
    };
  }, [checkUpdate]);

  return { checkUpdate };
};

export default useCheckUpdate;
