import { AutoComplete, Input } from "antd";
import { forwardRef, useImperativeHandle, useState } from "react";
import styles from "./Search.module.css";
import useSearchHistory from "../../hooks/searchHistory";
import React from "react";

const SearchForHistory = ({ fresh }: { fresh: any }, ref: any) => {
  const { searchHistory, setSearchValue, removeSearchValue } =
    useSearchHistory();
  const [search, setSearch] = useState("");
  const [searchKey, setSearchKey] = useState("");

  const handleSearch = (searchValue: any) => {
    searchValue = searchValue.replace(/\s/g, "");
    setSearchKey(searchValue);
    setSearchValue(searchValue);
    fresh();
  };

  const handleSelectHistory = (value: any) => {
    setSearch(value);
    handleSearch(value);
  };

  const handleClearHistory = (record: any) => {
    removeSearchValue(record.value);
  };

  const dropdownRender = () => (
    <div>
      {searchHistory.map((record: any, index: number) => (
        <div key={index} className={styles.historyItem}>
          <div
            onClick={() => handleSelectHistory(record.value)}
            className={styles.historyItemChild}
          >
            {record.value}
          </div>
          <div
            onClick={() => handleClearHistory(record)}
            className={styles.historyIcon}
          >
            X
          </div>
        </div>
      ))}
    </div>
  );

  useImperativeHandle(ref, () => ({
    searchKey,
  }));

  return (
    <>
      <AutoComplete
        value={search}
        dropdownRender={dropdownRender}
        options={searchHistory.map((item: any) => ({
          value: item.value,
        }))}
        onSearch={setSearch}
        onSelect={handleSelectHistory}
      >
        <Input.Search
          allowClear
          style={{ width: "360px", marginBottom: "10px" }}
          onSearch={handleSearch}
        />
      </AutoComplete>
    </>
  );
};

export default forwardRef(SearchForHistory);
