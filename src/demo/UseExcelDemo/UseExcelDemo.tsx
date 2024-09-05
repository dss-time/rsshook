import { useExcel } from "@/hooks/useExcel";
import React, { useState } from "react";

interface MyData {
  name: string;
  age: number;
  email: string;
}

const UseExcelDemo: React.FC = () => {
  const { importAndDisplayExcel } = useExcel<any>();
  const [htmlContent, setHtmlContent] = useState<string>("");
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

  // const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   if (file) {
  //     try {
  //       const htmlString = await importAndDisplayExcel(file);
  //       setHtmlContent(htmlString);
  //     } catch (error) {
  //       console.error(error);
  //       alert('文件导入失败');
  //     }
  //   }
  // };

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
      {/* <input type="file" accept=".xlsx, .xls" onChange={handleImport} />
      <div
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        style={{ marginTop: "20px" }}
      /> */}
    </div>
  );
};

export default UseExcelDemo;
