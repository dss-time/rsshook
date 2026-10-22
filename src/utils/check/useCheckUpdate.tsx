import {
  Button,
  ConfigProvider,
  notification,
  version as antdVersion,
} from 'antd';
import { useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface UseCheckUpdateOptions {
  interval?: number;
  storageKey?: string;
  getVersion?: () => Promise<string | null>;
}

const DEFAULT_INTERVAL = 60 * 60 * 1000;
const DEFAULT_STORAGE_KEY = 'rsshook:version';
const [antdMajor, antdMinor] = antdVersion.split('.').map(Number);
// `actions` replaced `btn` in 5.24; keep older Ant Design 5 consumers working.
const notificationActionsKey =
  antdMajor > 5 || (antdMajor === 5 && antdMinor >= 24) ? 'actions' : 'btn';

const defaultGetVersion = async () => {
  const response = await fetch(window.location.origin, {
    cache: 'no-cache',
  });

  return response.headers.get('etag') || response.headers.get('last-modified');
};

// Hook notifications render through a React 18/19 root instead of Ant Design 5's
// static renderer, which relies on APIs removed in React 19.
const UpdateNotification = ({
  onRefresh,
  onClose,
}: {
  onRefresh: () => void;
  onClose: () => void;
}) => {
  const [api, contextHolder] = notification.useNotification();
  useEffect(() => {
    api.open({
      key: 'version-update',
      message: '版本更新提示',
      description: '检测到系统当前版本已更新，请刷新后使用。',
      [notificationActionsKey]: (
        <Button type="primary" size="small" onClick={onRefresh}>
          确认更新
        </Button>
      ),
      duration: 0,
      onClose,
    });
    return () => api.destroy();
  }, [api, onRefresh, onClose]);
  return contextHolder;
};

/** @deprecated UI-coupled compatibility hook. Use rsshook/react/hooks useCheckUpdate with onUpdate. */
const useCheckUpdate = (options: UseCheckUpdateOptions = {}) => {
  const {
    interval = DEFAULT_INTERVAL,
    storageKey = DEFAULT_STORAGE_KEY,
    getVersion = defaultGetVersion,
  } = options;

  const notificationVisible = useRef(false);
  const notificationRoot = useRef<{
    root: Root;
    container: HTMLDivElement;
  } | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);

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

      if (!notificationRoot.current) {
        const container = document.createElement('div');
        document.body.appendChild(container);
        notificationRoot.current = { root: createRoot(container), container };
      }
      notificationRoot.current.root.render(
        <ConfigProvider wave={{ disabled: true }}>
          <UpdateNotification
            onRefresh={() => refresh(version)}
            onClose={close}
          />
        </ConfigProvider>
      );
    },
    [close, refresh]
  );

  const checkUpdate = useCallback((): Promise<void> => {
    if (notificationVisible.current || typeof window === 'undefined') {
      return Promise.resolve();
    }
    if (!mounted.current) return Promise.resolve();
    if (inFlight.current) return inFlight.current;

    const currentGeneration = generation.current;
    const request = Promise.resolve()
      .then(async () => {
        if (!mounted.current || generation.current !== currentGeneration)
          return;
        const version = await getVersion();
        if (
          !version ||
          !mounted.current ||
          generation.current !== currentGeneration
        )
          return;

        const previousVersion = window.localStorage.getItem(storageKey);

        if (!previousVersion) {
          window.localStorage.setItem(storageKey, version);
          return;
        }

        if (version !== previousVersion) {
          openNotification(version);
        }
      })
      .finally(() => {
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [getVersion, openNotification, storageKey]);

  useEffect(() => {
    mounted.current = true;
    const cleanupGeneration = generation.current + 1;
    const runCheck = () => {
      void checkUpdate().catch(() => undefined);
    };
    runCheck();
    const timer = setInterval(runCheck, interval);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runCheck();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', runCheck);

    return () => {
      mounted.current = false;
      generation.current = cleanupGeneration;
      inFlight.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', runCheck);
      const currentRoot = notificationRoot.current;
      notificationRoot.current = null;
      if (currentRoot) {
        // Unmount outside the parent's effect cleanup to avoid reentrant rendering.
        queueMicrotask(() => {
          currentRoot.root.unmount();
          currentRoot.container.remove();
        });
      }
      notificationVisible.current = false;
    };
  }, [checkUpdate, interval]);

  return { checkUpdate };
};

export default useCheckUpdate;
