import { useEffect, useState } from 'react';
import {
  SearchHistoryRecord,
  addSearchHistoryRecord,
  clearSearchHistory,
  filterExpiredSearchHistory,
  readSearchHistory,
  removeSearchHistoryRecord,
  writeSearchHistory,
} from '../core/searchHistory';

const useSearchHistory = (maxRecords = 8, maxDays = 7) => {
  const [searchHistory, setSearchHistory] =
    useState<SearchHistoryRecord[]>(readSearchHistory);

  const setSearchValue = (value: string) => {
    setSearchHistory(prevHistory =>
      addSearchHistoryRecord(prevHistory, value, maxRecords)
    );
  };

  const removeSearchValue = (value: string) => {
    setSearchHistory(prevHistory =>
      removeSearchHistoryRecord(prevHistory, value)
    );
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
  };

  useEffect(() => {
    setSearchHistory(prevHistory =>
      filterExpiredSearchHistory(prevHistory, maxDays)
    );
  }, [maxDays]);

  useEffect(() => {
    if (searchHistory.length === 0) {
      clearSearchHistory();
    } else {
      writeSearchHistory(searchHistory);
    }
  }, [searchHistory]);

  return {
    searchHistory,
    setSearchValue,
    removeSearchValue,
    handleClearHistory,
  };
};

export default useSearchHistory;
