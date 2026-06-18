const ExcelJS = require("exceljs");
const path = require("path");

// Lokasi file NQA Competency Matrix
const MATRIX_PATH = path.join(__dirname, "../template/NQA Competency Matrix - 2025-10-20 (1).xlsx");

// Map singkatan standar ke nama sheet yang ada di file Excel
const STANDARD_SHEETS = {
  "9001": "QMS - 9001;2008",
  "14001": "EMS - 14001;2004",
  "45001": "OHSAS - 18001;2007",
  "27001": "ISMS - 27001;2005",
  "22000": "FSMS - 22000;2005",
  "50001": "EnMS - 50001;2011",
  "37001": "ABMS - 37001;2016"
};

// Cache workbook supaya tidak perlu membaca ulang file Excel yang ukurannya besar berkali-kali
let workbookCache = null;

// Fungsi untuk membaca dan menginisialisasi file Excel Matriks Kompetensi
async function getWorkbook() {
  if (!workbookCache) {
    workbookCache = new ExcelJS.Workbook();
    await workbookCache.xlsx.readFile(MATRIX_PATH);
  }
  return workbookCache;
}

// Fungsi untuk mengambil seluruh daftar IAF/EAC Code dan deskripsinya dari Sheet QMS
// Daftar ini akan digunakan sebagai konteks ke AI (Groq) agar AI bisa memilih IAF Code yang valid
async function getEacList() {
  const wb = await getWorkbook();
  const ws = wb.getWorksheet("QMS - 9001;2008"); // Sheet QMS biasanya mencakup semua EAC code
  if (!ws) return [];

  const eacList = [];
  // Data IAF Code pada Sheet QMS dimulai dari baris 5
  for (let i = 5; i <= 45; i++) {
    const row = ws.getRow(i).values;
    if (row && row[3]) { // EAC Code berada di kolom C (index array = 3)
      const eacCode = row[3];
      const title = row[8] || row[7]; // Title / Scope berada di kolom G atau H
      
      // Jika EAC code valid berupa angka, masukkan ke dalam daftar
      if (eacCode && !isNaN(eacCode)) {
        eacList.push({ code: eacCode, description: title });
      }
    }
  }
  return eacList;
}

// Fungsi untuk mengambil seluruh daftar inisial Auditor dari baris 3 Sheet QMS
// Daftar inisial ini akan dikirim ke AI agar AI mengembalikan nama Auditor dalam bentuk inisial
async function getAuditorInitialsList() {
  const wb = await getWorkbook();
  const ws = wb.getWorksheet("QMS - 9001;2008");
  if (!ws) return [];

  const initials = [];
  const row3 = ws.getRow(3).values;
  
  // Posisi inisial auditor dimulai dari kolom index 8 ke kanan
  for (let i = 8; i < row3.length; i++) {
    if (row3[i] && typeof row3[i] === "string" && row3[i] !== "Title / Scope") {
      initials.push(row3[i].trim());
    }
  }
  return initials;
}

// Fungsi untuk melacak kualifikasi auditor berdasarkan inisial, IAF Code, dan skema standar yang dipilih
async function getAuditorSkills(initials, iafCode, standards) {
  const wb = await getWorkbook();
  const results = {
    auditor_initials: initials,
    skills: []
  };

  // Lakukan iterasi ke setiap skema/standar ISO yang direquest (misal: "9001", "45001")
  for (const std of standards) {
    const sheetName = STANDARD_SHEETS[std];
    if (!sheetName) continue; // Skip jika sheet standar tidak ditemukan dalam mapping

    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;

    const row3 = ws.getRow(3).values; // Baris untuk Inisial Auditor
    const row4 = ws.getRow(4).values; // Baris untuk Posisi/Role (misal: Lead Auditor)

    // 1. Cari index kolom yang sesuai dengan inisial auditor yang diekstrak oleh AI
    let colIndex = -1;
    for (let i = 1; i < row3.length; i++) {
      if (row3[i] && typeof row3[i] === "string" && row3[i].trim().toLowerCase() === initials.toLowerCase()) {
        colIndex = i;
        break;
      }
    }

    // Jika inisial auditor tidak ditemukan di Sheet ini, catat sebagai 'Not Found'
    if (colIndex === -1) {
      results.skills.push({
        standard: std,
        role: "Not Found",
        code: "Not Found",
        qualified: false
      });
      continue;
    }

    const role = row4[colIndex] || "Unknown";
    
    // 2. Cari baris yang cocok dengan IAF / EAC Code hasil ekstraksi AI
    let targetRow = -1;
    let skillCode = "";
    
    // Scan baris (dari baris 5 ke 60) untuk mencocokkan EAC/IAF Code
    for (let i = 5; i <= 60; i++) {
      const row = ws.getRow(i).values;
      if (!row) continue;
      
      let currentEac = null;
      let currentSkillCode = null;
      
      // Letak kolom EAC dan Skill Code berbeda-beda tergantung Sheet Standarnya
      if (std === "9001") {
        currentEac = row[3];
        currentSkillCode = row[4]; // QMS Code ada di sebelahnya
      } else if (std === "14001") {
        currentEac = row[3];
        currentSkillCode = row[4]; // EMS Code ada di sebelahnya
      } else if (std === "45001") {
        // Untuk Sheet OHSAS, kolom EAC mungkin tidak tertulis secara eksplisit, pakai kolom 3 sbg acuan standar
        currentEac = row[3]; 
        currentSkillCode = row[3]; // OHSAS Code
      }
      
      // Jika EAC Code di Excel cocok dengan IAF Code hasil AI, ambil baris ini
      if (currentEac && String(currentEac).trim() === String(iafCode).trim()) {
        targetRow = i;
        if (currentSkillCode) skillCode = currentSkillCode;
        break;
      }
    }

    // 3. Cek apakah sel persimpangan (baris IAF Code & kolom Auditor) memiliki isi/kualifikasi
    let qualified = false;
    if (targetRow !== -1) {
      const cellValue = ws.getRow(targetRow).values[colIndex];
      // Jika sel tersebut berisi tanggal, "Yes", atau data apa pun yang bukan kosong, berarti Kualified
      if (cellValue !== null && cellValue !== undefined && cellValue !== "") {
        qualified = true;
      }
    }

    // Masukkan data hasil penelusuran ke dalam response/results
    results.skills.push({
      standard: std,
      role: role.trim(),
      code: skillCode ? String(skillCode).trim() : "Unknown",
      qualified: qualified
    });
  }

  return results;
}

module.exports = { getEacList, getAuditorInitialsList, getAuditorSkills };
