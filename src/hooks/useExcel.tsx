import { useCallback } from "react";
import * as XLSX from "xlsx";

interface ExportOptions<T> {
  headers: string[];
  exportData: T[];
  fileName: string;
  sheetName?: string;
}

interface UseExcelReturn<T> {
  exportToExcel: (options: ExportOptions<T>) => void;
  importFromExcel: (file: File) => Promise<T[]>;
  importAndDisplayExcel: (file: File) => Promise<string>;
}

export function useExcel<T>(): UseExcelReturn<T> {
  // 导出数据到 Excel
  const exportToExcel = useCallback(
    ({
      headers,
      exportData: data,
      fileName,
      sheetName = "Sheet1",
    }: ExportOptions<T>) => {
      const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    },
    []
  );

  // 从 Excel 导入数据
  const importFromExcel = useCallback((file: File): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: T[] = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      };
      reader.onerror = error => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }, []);

  // 从 Excel 导入数据并生成 HTML 表格
  const importAndDisplayExcel = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const htmlString = XLSX.utils.sheet_to_html(worksheet);
          resolve(htmlString);
        } catch (error) {
          reject(new Error("文件解析失败，请检查文件格式"));
        }
      };
      reader.onerror = error => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }, []);

  return {
    exportToExcel,
    importFromExcel,
    importAndDisplayExcel,
  };
}
