const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

async function generateCR(clientData) {
  try {
    // Baca template CR dari folder template/
    const templatePath = path.join(__dirname, "../../template/cr.xlsm");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    // Ambil sheet utama tempat semua input diisi, complexity = hasil dari check-cr.js
    const ws = wb.getWorksheet("Complexity");

    // SECTION 1 - Company Details
    // Data dasar perusahaan klien
    // ws.getCell("F11") = ambil cell di kolom F baris 11
    // .value = isi nilainya
    ws.getCell("F11").value = clientData.company_name;
    ws.getCell("F12").value = clientData.address;

    // Contract Type: selalu "Initial" untuk klien baru
    ws.getCell("J15").value = "Initial";

    // SECTION 2 - Employees
    // Jumlah karyawan harian (day time employees)
    // Ini yang dipakai formula CR untuk hitung audit days
    ws.getCell("D23").value = clientData.total_employees;

    // SECTION 3 - ISO Standards yang dipilih
    // Di CR, ISO direpresentasikan sebagai TRUE/FALSE
    // QMS = ISO 9001, OHSAS = ISO 45001, EMS = ISO 14001
    // Formula di sheet lain akan otomatis kalkulasi audit days
    // berdasarkan TRUE/FALSE ini
    const standards = clientData.standards || [];

    // Cek sheet "Integration" untuk toggle ISO
    const wsIntegration = wb.getWorksheet("Integration");
    if (wsIntegration) {
      // Tiap ISO punya cell toggle TRUE/FALSE di sheet Integration
      // Kalau dipilih = TRUE, kalau tidak = FALSE
      wsIntegration.getCell("B2").value = standards.includes("9001");  // QMS
      wsIntegration.getCell("B3").value = standards.includes("45001"); // OHSAS
      wsIntegration.getCell("B4").value = standards.includes("14001"); // EMS
      wsIntegration.getCell("B5").value = standards.includes("27001"); // ISMS
      wsIntegration.getCell("B6").value = standards.includes("50001"); // EnMS
    }

    // SECTION 4 - Scope
    // Deskripsi apa yang dilakukan perusahaan klien
    ws.getCell("D48").value = clientData.scope;

    // SECTION 5 - IAF/EAC Code
    // Kode industri dari EAC List (lihat sheet "EAC List")
    // contoh: 14 = Rubber and plastic products
    //         28 = Construction
    //         33 = Information technology
    ws.getCell("D57").value = clientData.iaf_code;

    // SECTION 6 - Auditor
    // Nama auditor dan role-nya
    ws.getCell("D68").value = clientData.auditor_name;
    ws.getCell("F68").value = clientData.auditor_role || "Lead Auditor";

    // SECTION 7 - Approval / Sign off
    // Siapa yang mengisi dan kapan
    ws.getCell("F233").value = clientData.completed_by;
    ws.getCell("F234").value = new Date(); // otomatis pakai tanggal hari ini

    // simpan file excelnya
    const outputFileName = `CR_${clientData.company_name}_${Date.now()}.xlsx`;
    const outputPath = path.join(__dirname, "../../output", outputFileName);
    await wb.xlsx.writeFile(outputPath);

    console.log(`✅ CR generated: ${outputFileName}`);
    return outputPath;

  } catch (error) {
    console.error("❌ Error generating CR:", error);
    throw error;
  }
}

module.exports = { generateCR };