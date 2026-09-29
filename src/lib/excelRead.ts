/**
 * Lectura defensiva de .xlsx vía ExcelJS (sustituye sheetjs/xlsx community).
 * Solo extrae valores de celda; no evalúa fórmulas.
 */
import ExcelJS from "exceljs";

const MAX_EXCEL_BYTES = 8 * 1024 * 1024; // 8 MiB

export type SheetRows = { name: string; rows: unknown[][] };

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value == null) return null;
  if (typeof value === "object") {
    if ("result" in value && (value as ExcelJS.CellFormulaValue).result !== undefined) {
      return (value as ExcelJS.CellFormulaValue).result ?? null;
    }
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    }
    if ("text" in value) return (value as ExcelJS.CellHyperlinkValue).text;
    if ("error" in value) return null;
    if (value instanceof Date) return value;
  }
  return value;
}

export async function readWorkbookSheets(
  data: ArrayBuffer | Uint8Array,
  opts?: { maxBytes?: number },
): Promise<SheetRows[]> {
  const max = opts?.maxBytes ?? MAX_EXCEL_BYTES;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > max) {
    throw new Error(`El archivo Excel supera el límite de ${Math.round(max / (1024 * 1024))} MB`);
  }

  const wb = new ExcelJS.Workbook();
  // ExcelJS tipa Buffer; en browser Uint8Array es suficiente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(bytes as any);

  const sheets: SheetRows[] = [];
  wb.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values as ExcelJS.CellValue[];
      // ExcelJS usa índice 1-based; rellenamos huecos hasta la última columna usada.
      const arr: unknown[] = [];
      const last = values.length - 1;
      for (let c = 1; c <= last; c++) {
        arr[c - 1] = cellValue(values[c] ?? null);
      }
      // Garantiza índice de fila estable si hiciera falta (no usado hoy).
      while (rows.length < rowNumber - 1) rows.push([]);
      rows[rowNumber - 1] = arr;
    });
    sheets.push({ name: sheet.name, rows });
  });
  return sheets;
}

export async function readFileAsArrayBuffer(file: File, maxBytes = MAX_EXCEL_BYTES): Promise<ArrayBuffer> {
  if (file.size > maxBytes) {
    throw new Error(`El archivo supera el límite de ${Math.round(maxBytes / (1024 * 1024))} MB`);
  }
  return file.arrayBuffer();
}
