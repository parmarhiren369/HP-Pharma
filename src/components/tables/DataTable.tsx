import { ReactNode } from "react";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({ data, columns, keyField, onRowClick }: DataTableProps<T>) {
  const getCellValue = (item: T, column: Column<T>): ReactNode => {
    if (column.render) {
      return column.render(item);
    }
    const value = item[column.key as keyof T];
    return value as ReactNode;
  };

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr 
              key={String(item[keyField])}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
            >
              {columns.map((column) => (
                <td key={String(column.key)}>{getCellValue(item, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
