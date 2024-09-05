import { useExcel } from "@/hooks/useExcel";
import React, { useState } from "react";

interface MyData {
  name: string;
  age: number;
  email: string;
}

const UseExcelDemo: React.FC = () => {
  const { exportToExcel, importFromExcel } = useExcel<MyData>();
  const [exportData, setExportData] = useState<MyData[]>([
    { name: "John Doe", age: 30, email: "john@example.com" },
    { name: "Jane Doe", age: 25, email: "jane@example.com" },
  ]);

  const handleExport = () => {
    exportToExcel({
      headers: ["name", "age", "email"],
      exportData,
      fileName: "MyData",
    });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const importedData = await importFromExcel(file);
      setExportData(importedData);
    }
  };

  return (
    <div>
      <button onClick={handleExport}>导出数据</button>
      <input type="file" accept=".xlsx, .xls" onChange={handleImport} />
      <ul>
        {exportData.map((item, index) => (
          <li key={index}>
            {item.name} - {item.age} - {item.email}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UseExcelDemo;
