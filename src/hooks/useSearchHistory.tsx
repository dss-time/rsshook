import { useEffect, useState } from "react";
import {
  SearchHistoryRecord,
  addSearchHistoryRecord,
  clearSearchHistory,
  filterExpiredSearchHistory,
  readSearchHistory,
  removeSearchHistoryRecord,
  writeSearchHistory,
} from "../core/searchHistory";

const useSearchHistory = (maxRecords = 8, maxDays = 7) => {
  const [searchHistory, setSearchHistory] =
    useState<SearchHistoryRecord[]>(readSearchHistory);

  const setSearchValue = (value: string) => {
    setSearchHistory(prevHistory => {
      const nextHistory = addSearchHistoryRecord(prevHistory, value, maxRecords);
      writeSearchHistory(nextHistory);
      return nextHistory;
    });
  };

  const removeSearchValue = (value: string) => {
    setSearchHistory(prevHistory => {
      const nextHistory = removeSearchHistoryRecord(prevHistory, value);
      writeSearchHistory(nextHistory);
      return nextHistory;
    });
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setSearchHistory([]);
  };

  useEffect(() => {
    setSearchHistory(prevHistory => {
      const nextHistory = filterExpiredSearchHistory(prevHistory, maxDays);
      writeSearchHistory(nextHistory);
      return nextHistory;
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
