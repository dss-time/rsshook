import { useEffect } from "react";
import { useState } from "react";
/**

@see maxRecords 8条搜索数据(8 search results)
@see maxDays 最多保存七天(Save for up to seven days)

*/
const useSearchHistory = (maxRecords = 8, maxDays = 7) => {
  const [searchHistory, setSearchHistory] = useState(() => {
    const history = localStorage.getItem("searchHistory");
    if (history) {
      return JSON.parse(history);
    }
    return [];
  });

  const setSearchValue = (value: any) => {
    if (!value.trim()) {
      return;
    }

    setSearchHistory((prevHistory: any) => {
      const recordIndex = prevHistory.findIndex(
        (record: any) => record.value === value
      );

      const newHistory = [...prevHistory];
      if (recordIndex !== -1) {
        newHistory.splice(recordIndex, 1);
      }

      newHistory.unshift({ value, time: new Date() });

      if (newHistory.length > maxRecords) {
        newHistory.pop();
      }

      localStorage.setItem("searchHistory", JSON.stringify(newHistory));

      return newHistory;
    });
  };

  const removeSearchValue = (value: any) => {
    setSearchHistory((prevHistory: any) => {
      const newHistory = prevHistory.filter(
        (record: any) => record.value !== value
      );
      localStorage.setItem("searchHistory", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const handleClearHistory = () => {
    localStorage.removeItem("searchHistory");
    setSearchHistory([]);
  };

  useEffect(() => {
    setSearchHistory((prevHistory: any[]) => {
      const currentTime = Date.now();

      const newHistory = prevHistory.filter(
        record =>
          (currentTime - new Date(record.time).getTime()) /
            (1000 * 60 * 60 * 24) <=
          maxDays
      );

      localStorage.setItem("searchHistory", JSON.stringify(newHistory));

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
