import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

export type ExportExcelOptions<T extends Record<string, unknown>> = {
  fileName: string;
  sheetName?: string;
  rows: T[];
};

export function exportToExcel<T extends Record<string, unknown>>({
  fileName,
  sheetName = "Sheet1",
  rows,
}: ExportExcelOptions<T>) {
  const safeRows = rows ?? [];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const finalName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  saveAs(blob, finalName);
}
