import { onMounted, ref } from 'vue';
import {
  SearchHistoryRecord,
  addSearchHistoryRecord,
  clearSearchHistory,
  filterExpiredSearchHistory,
  readSearchHistory,
  removeSearchHistoryRecord,
  writeSearchHistory,
} from '../core/searchHistory';

export default function useSearchHistory(maxRecords = 8, maxDays = 7) {
  const searchHistory = ref<SearchHistoryRecord[]>([]);

  const sync = (nextHistory: SearchHistoryRecord[]) => {
    searchHistory.value = nextHistory;
    writeSearchHistory(nextHistory);
  };

  const setSearchValue = (value: string) => {
    sync(addSearchHistoryRecord(searchHistory.value, value, maxRecords));
  };

  const removeSearchValue = (value: string) => {
    sync(removeSearchHistoryRecord(searchHistory.value, value));
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    searchHistory.value = [];
  };

  onMounted(() => {
    sync(filterExpiredSearchHistory(readSearchHistory(), maxDays));
  });

  return {
    searchHistory,
    setSearchValue,
    removeSearchValue,
    handleClearHistory,
  };
}
