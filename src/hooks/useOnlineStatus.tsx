import { useSyncExternalStore } from 'react';

const getOnlineStatus = () =>
  typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;

const getServerSnapshot = () => true;

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

const useOnlineStatus = () =>
  useSyncExternalStore(subscribe, getOnlineStatus, getServerSnapshot);

export default useOnlineStatus;
