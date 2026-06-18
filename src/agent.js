const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { getUnreadEmails, markAsRead, replyWithMessage } = require("./gmail");
const { parseEmailToClientData, isNewClientEmail } = require("./parser");
const { generateQuotation } = require("./generator/quotation");
const { generateCR } = require("./generator/cr");
const { generateQRF } = require("./generator/qrf");
const { getAuditorSkills } = require("./matrix");
const { withRetry, registerErrorHandlers } = require("./errorHandler");

registerErrorHandlers();

// Fungsi utama yang dijalankan tiap polling
async function processEmails() {
  try {
    console.log("🔍 Checking for new emails...");

    // 1. Ambil semua email yang belum dibaca
    const emails = await withRetry(() => getUnreadEmails());

    if (emails.length === 0) {
      console.log("📭 No new emails");
      return;
    }

    console.log(`📬 Found ${emails.length} unread email(s)`);

    // 2. Loop tiap email, cek apakah email klien baru
    for (const email of emails) {
      console.log(`📧 Processing: "${email.subject}"`);

      // Cek keyword di subject/body
      // Kalau bukan email klien baru, skip
      if (!isNewClientEmail(email.subject, email.body)) {
        console.log("⏭️  Not a new client email, skipping...");
        // Tandai sebagai read supaya tidak diproses lagi
        await markAsRead(email.messageId);
        continue;
      }

      console.log("✅ New client email detected! Processing...");

      // 3. Parse email → ekstrak data klien via Groq
      const clientData = await withRetry(() => parseEmailToClientData(email.body));
      console.log(`🏢 Client: ${clientData.company_name}`);

      // 4. Melakukan pengecekan Auditor Skills dari file NQA Competency Matrix (Excel)
      //    Mencocokkan inisial auditor dan IAF code untuk mendapatkan status Qualified & Skill Code spesifik
      console.log("🔍 Checking Competency Matrix for:", clientData.auditor_name);
      const skillsMatrix = await withRetry(() => getAuditorSkills(
        clientData.auditor_name || "",
        clientData.iaf_code || "",
        clientData.standards || []
      ));

      // Membuat susunan teks/pesan informasi matriks auditor yang akan disisipkan di dalam Email
      let messageText = `Informasi Auditor & Skema untuk ${clientData.company_name}:\n\n`;
      messageText += `Auditor Initials: ${skillsMatrix.auditor_initials}\n`;
      messageText += `IAF/EAC Code: ${clientData.iaf_code} (${clientData.iaf_description || ""})\n\n`;
      
      // Looping untuk menuliskan daftar skill berdasarkan standar (9001, 14001, dll)
      skillsMatrix.skills.forEach(s => {
        messageText += `- Standard: ISO ${s.standard}\n`;
        messageText += `  Role: ${s.role}\n`;
        messageText += `  Skill Code: ${s.code}\n`;
        messageText += `  Qualified: ${s.qualified ? "Yes" : "No"}\n\n`;
      });

      // 5. Generate semua file dokumen (CR, Quotation, QRF)
      console.log("📄 Generating documents...");
      const outputFiles = [];

      const crPath = await withRetry(() => generateCR(clientData));
      outputFiles.push(crPath);

      const quotationPath = await withRetry(() => generateQuotation(clientData));
      outputFiles.push(quotationPath);

      const qrfPath = await withRetry(() => generateQRF(clientData));
      outputFiles.push(qrfPath);

      console.log(`✅ Generated ${outputFiles.length} files`);
      console.log("💬 Sending message text and files...");

      // 6. Reply email papah dengan info dari matrix dan files
      await withRetry(() => replyWithMessage(email, messageText, outputFiles));
      console.log("📨 Reply sent to:", email.from);

      // 6. Tandai email sebagai sudah dibaca
      // supaya tidak diproses lagi di polling berikutnya
      await markAsRead(email.messageId);

      console.log("✅ Done processing:", clientData.company_name);
      console.log("─".repeat(50));
    }

  } catch (error) {
    console.error("❌ Error processing emails:", error);
  }
}

// Fungsi sleep untuk polling interval
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Entry point — jalankan agent dengan polling loop
async function startAgent() {
  console.log("🚀 NQA Agent started!");
  console.log(`📧 Monitoring: ${process.env.AGENT_EMAIL}`);
  console.log(`⏱️  Polling every ${process.env.POLLING_INTERVAL_MS / 1000} seconds`);
  console.log("─".repeat(50));

  // Loop terus sampai di-stop manual (Ctrl+C)
  while (true) {
    await processEmails();
    // Tunggu sesuai interval sebelum cek lagi
    await sleep(parseInt(process.env.POLLING_INTERVAL_MS) || 60000);
  }
}

// Jalankan agent
startAgent();