const ExcelJS = require("exceljs");

async function checkCRCells() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("template/cr.xlsm");
  
  const ws = wb.getWorksheet("Complexity");
  
  // fokus row 8-80, area input utama
  for (let rowNum = 8; rowNum <= 80; rowNum++) {
    const row = ws.getRow(rowNum);
    row.eachCell((cell, colNumber) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
        if (String(cell.value).includes("object Object")) return;
        // hanya tampilkan kolom A-P saja (area kiri = input area)
        if (colNumber > 16) return;
        console.log(`[${cell.address}] = "${cell.value}"`);
      }
    });
  }
}

checkCRCells();