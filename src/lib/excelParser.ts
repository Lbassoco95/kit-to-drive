import { readFileAsArrayBuffer, readWorkbookSheets } from "@/lib/excelRead";

export type ContenedorFromExcel = {
  folio_contenedor: string;
  fecha_arribo: string;
  modelo: string;
  color?: string;
  unidades: Array<{
    ns_chasis: string;
    ns_motor: string;
    chasis_asignado?: string;
    color?: string;
  }>;
};

export type ContainerSheetData = {
  folio_contenedor: string;
  tipo: "chasis" | "motores";
  modelo: string;
  chasis: VinFromExcel[];
  motores: MotorFromExcel[];
};

export type MotorFromExcel = {
  numero_motor: string;
  modelo?: string;
  color?: string;
};

export type VinFromExcel = {
  numero_chasis: string;
  color: string;
  modelo?: string;
};

export type ParteFromExcel = {
  descripcion: string;
  modelo?: string;
  cantidad_esperada: number;
};

/**
 * Parse Excel file with multiple sheets (one per container)
 * Sheet name = container number (e.g., EGSU1319874)
 * Detects type by headers: FRAME NUMBER = chasis, ENGINE NUMBER = motores
 */
export async function parseContenedoresExcel(file: File): Promise<ContainerSheetData[]> {
  const buf = await readFileAsArrayBuffer(file);
  const sheets = await readWorkbookSheets(buf);
  const containerSheets: ContainerSheetData[] = [];

  for (const { name: sheetName, rows: jsonData } of sheets) {
    if (jsonData.length === 0) continue;

    const folioContenedor = sheetName.trim();

    let headerRowIndex = -1;
    let sheetType: "chasis" | "motores" | null = null;
    let frameColIndex = -1;
    let engineColIndex = -1;
    let colorColIndex = -1;
    let modelColIndex = -1;

    for (let i = 0; i < Math.min(30, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      row.forEach((cell, colIndex) => {
        const cellStr = String(cell || "").trim().toUpperCase();
        if (cellStr === "FRAME NUMBER" || cellStr === "FRAME NO.") {
          headerRowIndex = i;
          frameColIndex = colIndex;
          sheetType = "chasis";
        } else if (cellStr === "ENGINE NUMBER" || cellStr === "ENGINE NO.") {
          headerRowIndex = i;
          engineColIndex = colIndex;
          sheetType = "motores";
        } else if (cellStr === "COLOR" && headerRowIndex === i) {
          colorColIndex = colIndex;
        } else if ((cellStr === "MODEL NO" || cellStr === "MODEL") && headerRowIndex === i) {
          modelColIndex = colIndex;
        }
      });

      if (headerRowIndex !== -1 && sheetType) break;
    }

    if (!sheetType || headerRowIndex === -1) continue;

    const chasis: VinFromExcel[] = [];
    const motores: MotorFromExcel[] = [];
    let modelo = "";

    if (sheetType === "chasis") {
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const nsChasis = String(row[frameColIndex] || "").trim();
        if (!nsChasis || nsChasis.length < 4) continue;

        const rowStr = row.join(" ").toUpperCase();
        if (rowStr.includes("BRAND") || rowStr.includes("SUPPLIER") || rowStr.includes("LUOYANG")) {
          continue;
        }

        chasis.push({
          numero_chasis: nsChasis,
          color: colorColIndex !== -1 ? String(row[colorColIndex] || "").trim() : "BLANCO",
          modelo: modelColIndex !== -1 ? String(row[modelColIndex] || "").trim() : undefined,
        });
      }

      if (!modelo && chasis.length > 0 && modelColIndex !== -1) {
        const firstRow = jsonData[headerRowIndex + 1];
        if (firstRow && firstRow[modelColIndex]) {
          modelo = String(firstRow[modelColIndex]).trim();
        }
      }
    } else {
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const numeroMotor = String(row[engineColIndex] || "").trim();
        if (!numeroMotor || numeroMotor.length < 4) continue;

        const rowStr = row.join(" ").toUpperCase();
        if (rowStr.includes("BRAND") || rowStr.includes("SUPPLIER") || rowStr.includes("LUOYANG")) {
          continue;
        }

        motores.push({
          numero_motor: numeroMotor,
          color: colorColIndex !== -1 ? String(row[colorColIndex] || "").trim() : undefined,
          modelo: modelColIndex !== -1 ? String(row[modelColIndex] || "").trim() : undefined,
        });
      }

      if (!modelo && motores.length > 0 && modelColIndex !== -1) {
        const firstRow = jsonData[headerRowIndex + 1];
        if (firstRow && firstRow[modelColIndex]) {
          modelo = String(firstRow[modelColIndex]).trim();
        }
      }
    }

    if ((sheetType === "chasis" && chasis.length > 0) || (sheetType === "motores" && motores.length > 0)) {
      containerSheets.push({
        folio_contenedor: folioContenedor,
        tipo: sheetType,
        modelo: modelo || "200cc 2025",
        chasis,
        motores,
      });
    }
  }

  return containerSheets;
}

/**
 * Parse Excel packing list (parts inventory).
 */
export async function parsePackingListExcel(file: File): Promise<ParteFromExcel[]> {
  const buf = await readFileAsArrayBuffer(file);
  const sheets = await readWorkbookSheets(buf);
  const first = sheets[0];
  if (!first || first.rows.length === 0) return [];

  const jsonData = first.rows;
  const partes: ParteFromExcel[] = [];

  let headerRowIndex = -1;
  let descColIndex = -1;
  let modelColIndex = -1;
  let qtyColIndex = -1;

  for (let i = 0; i < Math.min(50, jsonData.length); i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    row.forEach((cell, colIndex) => {
      const cellStr = String(cell || "").trim().toUpperCase();
      if (cellStr === "DESCRIPTIONS" || cellStr === "DESCRIPTION") {
        headerRowIndex = i;
        descColIndex = colIndex;
      } else if (cellStr === "MODEL" && headerRowIndex === i) {
        modelColIndex = colIndex;
      } else if ((cellStr === "QUANTITY" || cellStr === "QTY") && headerRowIndex === i) {
        qtyColIndex = colIndex;
      }
    });

    if (headerRowIndex !== -1 && descColIndex !== -1) break;
  }

  if (headerRowIndex === -1) return [];

  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    const descripcion = String(row[descColIndex] || "").trim();
    if (!descripcion || descripcion.toLowerCase() === "none" || descripcion.toLowerCase() === "null") {
      continue;
    }

    const rowStr = row.join(" ").toUpperCase();
    if (rowStr.includes("BRAND") || rowStr.includes("SUPPLIER") || rowStr.includes("LUOYANG")) {
      continue;
    }

    partes.push({
      descripcion,
      modelo: modelColIndex !== -1 ? String(row[modelColIndex] || "").trim() : undefined,
      cantidad_esperada: qtyColIndex !== -1 ? parseInt(String(row[qtyColIndex] || "0"), 10) || 0 : 0,
    });
  }

  return partes;
}
