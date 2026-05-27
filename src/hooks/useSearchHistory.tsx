import { useEffect, useState } from "react";

export interface SearchHistoryRecord {
  value: string;
  time: string;
}

const STORAGE_KEY = "searchHistory";

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

const readHistory = (): SearchHistoryRecord[] => {
  if (!canUseStorage()) return [];

  try {
    const history = window.localStorage.getItem(STORAGE_KEY);
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
};

const writeHistory = (history: SearchHistoryRecord[]) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

const useSearchHistory = (maxRecords = 8, maxDays = 7) => {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryRecord[]>(readHistory);

  const setSearchValue = (value: string) => {
    const searchValue = value.trim();

    if (!searchValue) {
      return;
    }

    setSearchHistory(prevHistory => {
      const recordIndex = prevHistory.findIndex(record => record.value === searchValue);

      const newHistory = [...prevHistory];
      if (recordIndex !== -1) {
        newHistory.splice(recordIndex, 1);
      }

      newHistory.unshift({ value: searchValue, time: new Date().toISOString() });

      if (newHistory.length > maxRecords) {
        newHistory.pop();
      }

      writeHistory(newHistory);

      return newHistory;
    });
  };

  const removeSearchValue = (value: string) => {
    setSearchHistory(prevHistory => {
      const newHistory = prevHistory.filter(record => record.value !== value);
      writeHistory(newHistory);
      return newHistory;
    });
  };

  const handleClearHistory = () => {
    if (canUseStorage()) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSearchHistory([]);
  };

  useEffect(() => {
    setSearchHistory(prevHistory => {
      const currentTime = Date.now();

      const newHistory = prevHistory.filter(
        record =>
          (currentTime - new Date(record.time).getTime()) /
            (1000 * 60 * 60 * 24) <=
          maxDays
      );

      writeHistory(newHistory);

      return newHistory;
    });
  }, [maxDays]);

  return {
    searchHistory,
    setSearchValue,
    removeSearchValue,
    handleClearHistory,
  };
};
export default useSearchHistory;
