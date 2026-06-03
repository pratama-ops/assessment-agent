const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { getUnreadEmails, markAsRead, replyWithFiles } = require("./gmail");
const { parseEmailToClientData, isNewClientEmail } = require("./parser");
const { generateQuotation } = require("./generators/quotation");
const { generateCR } = require("./generators/cr");
const { generateQRF } = require("./generators/qrf");
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
        await markAsRead(email.id);
        continue;
      }

      console.log("✅ New client email detected! Processing...");

      // 3. Parse email → ekstrak data klien via Groq
      const clientData = await withRetry(() => parseEmailToClientData(email.body));
      console.log(`🏢 Client: ${clientData.company_name}`);

      // 4. Generate semua file dokumen
      console.log("📄 Generating documents...");
      const outputFiles = [];

      // Generate CR (.xlsx)
      const crPath = await withRetry(() => generateCR(clientData));
      outputFiles.push(crPath);

      // Generate Quotation (.docx)
      // Kalau 2 ISO atau lebih, tanya apakah mau digabung atau pisah
      // Untuk sekarang default: 1 file quotation untuk semua ISO
      const quotationPath = await withRetry(() => generateQuotation(clientData));
      outputFiles.push(quotationPath);

      // Generate QRF (.pdf)
      const qrfPath = await withRetry(() => generateQRF(clientData));
      outputFiles.push(qrfPath);

      console.log(`✅ Generated ${outputFiles.length} files`);

      // 5. Reply email papah dengan file hasil generate
      await withRetry(() => replyWithFiles(email, outputFiles));
      console.log("📨 Reply sent to:", email.from);

      // 6. Tandai email sebagai sudah dibaca
      // supaya tidak diproses lagi di polling berikutnya
      await markAsRead(email.id);

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