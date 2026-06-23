const fs = require("fs");
const path = require("path");

// Tentukan direktori penyimpanan file JSON
const DB_DIR = path.join(__dirname, "../database");

// Pastikan foldernya ada, jika tidak, buat baru
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Fungsi untuk menyimpan data klien berdasarkan threadId dari email
function saveClientData(threadId, data) {
  try {
    const filePath = path.join(DB_DIR, `${threadId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`💾 Saved state to ${threadId}.json`);
  } catch (error) {
    console.error("❌ Error saving client data:", error);
  }
}

// Fungsi untuk membaca data klien berdasarkan threadId dari email
// Mengembalikan null jika file tidak ditemukan
function loadClientData(threadId) {
  try {
    const filePath = path.join(DB_DIR, `${threadId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error("❌ Error loading client data:", error);
    return null;
  }
}

module.exports = { saveClientData, loadClientData };
