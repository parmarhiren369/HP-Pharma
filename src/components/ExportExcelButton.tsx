import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/export-excel";
import { Download, Printer } from "lucide-react";

type ExportExcelButtonProps<T extends Record<string, unknown>> = {
  rows: T[];
  fileName: string;
  sheetName?: string;
  label?: string;
  printLabel?: string;
  showPrint?: boolean;
  disabled?: boolean;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
};

export function ExportExcelButton<T extends Record<string, unknown>>({
  rows,
  fileName,
  sheetName,
  label = "Export",
  printLabel = "Print",
  showPrint = true,
  disabled,
  variant = "secondary",
}: ExportExcelButtonProps<T>) {
  const isDisabled = disabled ?? !rows?.length;

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={variant}
        onClick={() => exportToExcel({ rows, fileName, sheetName })}
        disabled={isDisabled}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>

      {showPrint ? (
        <Button
          type="button"
          variant={variant}
          onClick={() => window.print()}
          disabled={disabled}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          {printLabel}
        </Button>
      ) : null}
    </div>
  );
}
