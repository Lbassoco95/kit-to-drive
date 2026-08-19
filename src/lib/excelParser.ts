import * as XLSX from 'xlsx';

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
 * Extracts container info and VINs from each sheet
 * Uses dynamic header search instead of fixed row numbers
 */
export function parseContenedoresExcel(file: File): Promise<ContenedorFromExcel[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const contenedores: ContenedorFromExcel[] = [];
        
        // Process each sheet as a container
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
          
          if (jsonData.length === 0) return;
          
          // Find container info dynamically
          let folioContenedor = '';
          let modelo = '';
          let cantidadDeclarada = 0;
          let color = 'BLANCO';
          
          // Search for CONTAINER NO., MODEL, QUANTITY in any row
          for (let i = 0; i < Math.min(20, jsonData.length); i++) {
            const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!row || row.length === 0) continue;
            
            row.forEach((cell, colIndex) => {
              const cellStr = String(cell || '').trim().toUpperCase();
              
              if (cellStr.includes('CONTAINER NO.')) {
                // Take only the part before "/" if present
                const containerValue = String(row[colIndex + 1] || '').trim();
                folioContenedor = containerValue.split('/')[0].trim();
              } else if (cellStr.includes('MODEL :')) {
                modelo = String(row[colIndex + 1] || '').trim();
              } else if (cellStr.includes('QUANTITY') || cellStr.includes('CANTIDAD')) {
                cantidadDeclarada = parseInt(String(row[colIndex + 1] || '0'), 10) || 0;
              }
            });
          }
          
          // Find header row dynamically by searching for "FRAME NUMBER"
          let headerRowIndex = -1;
          let frameColIndex = -1;
          let colorColIndex = -1;
          let modelColIndex = -1;
          
          for (let i = 0; i < Math.min(30, jsonData.length); i++) {
            const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!row || row.length === 0) continue;
            
            row.forEach((cell, colIndex) => {
              const cellStr = String(cell || '').trim().toUpperCase();
              if (cellStr === 'FRAME NUMBER' || cellStr === 'FRAME NO.') {
                headerRowIndex = i;
                frameColIndex = colIndex;
              } else if (cellStr === 'COLOR' && headerRowIndex === i) {
                colorColIndex = colIndex;
              } else if (cellStr === 'MODEL' && headerRowIndex === i) {
                modelColIndex = colIndex;
              }
            });
            
            if (headerRowIndex !== -1 && frameColIndex !== -1) break;
          }
          
          // Extract VINs from rows after header
          const unidades: ContenedorFromExcel['unidades'] = [];
          
          if (headerRowIndex !== -1) {
            for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
              const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
              if (!row || row.length === 0) continue;
              
              const nsChasis = String(row[frameColIndex] || '').trim();
              if (!nsChasis || nsChasis.length < 4) continue; // Skip empty or invalid VINs
              
              // Skip rows that look like supplier info (contain BRAND or are in first 15 rows)
              // Supplier name (LUOYANG SHUAIYING...) is never displayed or stored per business rule
              const rowStr = row.join(' ').toUpperCase();
              if (rowStr.includes('BRAND') || rowStr.includes('SUPPLIER') || rowStr.includes('LUOYANG')) {
                continue;
              }
              
              unidades.push({
                ns_chasis: nsChasis,
                ns_motor: '', // Will be filled manually or from another column if available
                color: colorColIndex !== -1 ? String(row[colorColIndex] || '').trim() : undefined,
              });
            }
          }
          
          // Use extracted model if not found in metadata
          if (!modelo && unidades.length > 0 && modelColIndex !== -1) {
            // Try to get model from first VIN row
            const firstRow = jsonData[headerRowIndex + 1] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (firstRow && firstRow[modelColIndex]) {
              modelo = String(firstRow[modelColIndex]).trim();
            }
          }
          
          // Only add if we have valid data
          if (folioContenedor && unidades.length > 0) {
            contenedores.push({
              folio_contenedor: folioContenedor,
              fecha_arribo: new Date().toISOString().slice(0, 10), // Default to today
              modelo: modelo || '200cc 2025',
              color: color,
              unidades,
            });
          }
        });
        
        resolve(contenedores);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse Excel file for VINs (chassis numbers) specifically for inventory
 * Extracts: container number, FRAME NUMBER (chassis), COLOR, MODEL
 * Used for inventario_chasis and inventario_colores
 * Uses dynamic header search instead of fixed row numbers
 */
export function parseVinsExcel(file: File): Promise<{ folio_contenedor: string; modelo: string; vins: VinFromExcel[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Process first sheet only
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          resolve({ folio_contenedor: '', modelo: '', vins: [] });
          return;
        }
        
        // Find container info dynamically
        let folioContenedor = '';
        let modelo = '';
        let cantidadDeclarada = 0;
        
        // Search for CONTAINER NO., MODEL, QUANTITY in any row
        for (let i = 0; i < Math.min(20, jsonData.length); i++) {
          const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!row || row.length === 0) continue;
          
          row.forEach((cell, colIndex) => {
            const cellStr = String(cell || '').trim().toUpperCase();
            
            if (cellStr.includes('CONTAINER NO.')) {
              // Take only the part before "/" if present
              const containerValue = String(row[colIndex + 1] || '').trim();
              folioContenedor = containerValue.split('/')[0].trim();
            } else if (cellStr.includes('MODEL :')) {
              modelo = String(row[colIndex + 1] || '').trim();
            } else if (cellStr.includes('QUANTITY') || cellStr.includes('CANTIDAD')) {
              cantidadDeclarada = parseInt(String(row[colIndex + 1] || '0'), 10) || 0;
            }
          });
        }
        
        // Find header row dynamically by searching for "FRAME NUMBER"
        let headerRowIndex = -1;
        let frameColIndex = -1;
        let colorColIndex = -1;
        let modelColIndex = -1;
        
        for (let i = 0; i < Math.min(30, jsonData.length); i++) {
          const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!row || row.length === 0) continue;
          
          row.forEach((cell, colIndex) => {
            const cellStr = String(cell || '').trim().toUpperCase();
            if (cellStr === 'FRAME NUMBER' || cellStr === 'FRAME NO.') {
              headerRowIndex = i;
              frameColIndex = colIndex;
            } else if (cellStr === 'COLOR' && headerRowIndex === i) {
              colorColIndex = colIndex;
            } else if (cellStr === 'MODEL' && headerRowIndex === i) {
              modelColIndex = colIndex;
            }
          });
          
          if (headerRowIndex !== -1 && frameColIndex !== -1) break;
        }
        
        // Extract VINs from rows after header
        const vins: VinFromExcel[] = [];
        
        if (headerRowIndex !== -1) {
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!row || row.length === 0) continue;
            
            const numeroChasis = String(row[frameColIndex] || '').trim();
            if (!numeroChasis || numeroChasis.length < 4) continue; // Skip empty or invalid VINs
            
            // Skip rows that look like supplier info (contain BRAND or are in first 15 rows)
            // Supplier name (LUOYANG SHUAIYING...) is never displayed or stored per business rule
            const rowStr = row.join(' ').toUpperCase();
            if (rowStr.includes('BRAND') || rowStr.includes('SUPPLIER') || rowStr.includes('LUOYANG')) {
              continue;
            }
            
            vins.push({
              numero_chasis: numeroChasis,
              color: colorColIndex !== -1 ? String(row[colorColIndex] || '').trim() : 'BLANCO',
              modelo: modelColIndex !== -1 ? String(row[modelColIndex] || '').trim() : undefined,
            });
          }
        }
        
        // Use extracted model if not found in metadata
        if (!modelo && vins.length > 0 && modelColIndex !== -1) {
          // Try to get model from first VIN row
          const firstRow = jsonData[headerRowIndex + 1] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (firstRow && firstRow[modelColIndex]) {
            modelo = String(firstRow[modelColIndex]).trim();
          }
        }
        
        resolve({
          folio_contenedor: folioContenedor,
          modelo: modelo || '200cc 2025',
          vins,
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse Excel file for packing list (parts inventory)
 * Extracts parts from DESCRIPTIONS, MODEL, QUANTITY columns
 * Uses dynamic header search instead of fixed row numbers and column positions
 * Skips rows with empty descriptions
 */
export function parsePackingListExcel(file: File): Promise<ParteFromExcel[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const partes: ParteFromExcel[] = [];
        
        // Process first sheet only
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          resolve([]);
          return;
        }
        
        // Find header row dynamically by searching for "DESCRIPTIONS"
        let headerRowIndex = -1;
        let descColIndex = -1;
        let modelColIndex = -1;
        let qtyColIndex = -1;
        
        for (let i = 0; i < Math.min(50, jsonData.length); i++) {
          const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!row || row.length === 0) continue;
          
          row.forEach((cell, colIndex) => {
            const cellStr = String(cell || '').trim().toUpperCase();
            if (cellStr === 'DESCRIPTIONS' || cellStr === 'DESCRIPTION') {
              headerRowIndex = i;
              descColIndex = colIndex;
            } else if (cellStr === 'MODEL' && headerRowIndex === i) {
              modelColIndex = colIndex;
            } else if ((cellStr === 'QUANTITY' || cellStr === 'QTY') && headerRowIndex === i) {
              qtyColIndex = colIndex;
            }
          });
          
          if (headerRowIndex !== -1 && descColIndex !== -1) break;
        }
        
        // Extract parts from rows after header
        if (headerRowIndex !== -1) {
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!row || row.length === 0) continue;
            
            const descripcion = String(row[descColIndex] || '').trim();
            
            // Skip rows where description cell is empty or None
            if (!descripcion || descripcion.toLowerCase() === 'none' || descripcion.toLowerCase() === 'null') {
              continue;
            }
            
            // Skip rows that look like supplier info
            // Supplier name (LUOYANG SHUAIYING...) is never displayed or stored per business rule
            const rowStr = row.join(' ').toUpperCase();
            if (rowStr.includes('BRAND') || rowStr.includes('SUPPLIER') || rowStr.includes('LUOYANG')) {
              continue;
            }
            
            partes.push({
              descripcion,
              modelo: modelColIndex !== -1 ? String(row[modelColIndex] || '').trim() : undefined,
              cantidad_esperada: qtyColIndex !== -1 ? parseInt(String(row[qtyColIndex] || '0'), 10) || 0 : 0,
            });
          }
        }
        
        resolve(partes);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}
