import * as XLSX from 'xlsx';

interface ExportOptions<T> {
  headers: string[];
  exportData: T[];
  fileName: string;
  sheetName?: string;
}

export function useExcel<T>() {
  const exportToExcel = ({
    headers,
    exportData,
    fileName,
    sheetName = 'Sheet1',
  }: ExportOptions<T>) => {
    const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  const importFromExcel = (file: File): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        resolve(XLSX.utils.sheet_to_json<T>(worksheet));
      };
      reader.onerror = error => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const importAndDisplayExcel = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          resolve(XLSX.utils.sheet_to_html(worksheet));
        } catch {
          reject(new Error('文件解析失败，请检查文件格式'));
        }
      };
      reader.onerror = error => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  return {
    exportToExcel,
    importFromExcel,
    importAndDisplayExcel,
  };
}

export default useExcel;
