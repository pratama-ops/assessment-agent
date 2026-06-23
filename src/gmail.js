const { google } = require("googleapis");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

// Buat koneksi OAuth2 ke Gmail menggunakan credentials dari .env
function createGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  // Set refresh token supaya access token otomatis diperbarui
  // kalau expired tanpa perlu login ulang
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// Ambil semua email yang belum dibaca di inbox
async function getUnreadEmails() {
  try {
    const gmail = createGmailClient();

    // Cari email yang belum dibaca (UNREAD) di inbox
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread in:inbox",
      maxResults: 10, // ambil maksimal 10 email sekaligus
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) return [];

    // Ambil detail tiap email
    const rawEmails = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.id) return null;

        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = detail.data.payload.headers;
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const body = extractEmailBody(detail.data.payload);

        return {
          messageId: msg.id,
          threadId: msg.threadId, // Menambahkan threadId untuk melacak riwayat percakapan/revisi
          subject,
          from,
          body,
        };
      })
    );

    const emails = rawEmails.filter(Boolean);

    return emails;
  } catch (error) {
    console.error("❌ Error getting emails:", error);
    throw error;
  }
}

// Ekstrak teks dari body email
// Email bisa punya format plain text atau HTML
// Kita ambil plain text dulu, kalau tidak ada baru HTML
function extractEmailBody(payload) {
  // Kalau email simple (tidak ada parts)
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Kalau email punya multiple parts (plain + html)
  if (payload.parts) {
    // Cari bagian plain text dulu
    const plainPart = payload.parts.find(
      (part) => part.mimeType === "text/plain"
    );
    if (plainPart?.body?.data) {
      return Buffer.from(plainPart.body.data, "base64").toString("utf-8");
    }

    // Kalau tidak ada plain text, ambil HTML
    const htmlPart = payload.parts.find(
      (part) => part.mimeType === "text/html"
    );
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
    }
  }

  return "";
}

// Tandai email sebagai sudah dibaca
// supaya agent tidak proses email yang sama dua kali
async function markAsRead(messageId) {
  try {
    const gmail = createGmailClient();
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"], // hapus label UNREAD
      },
    });
    console.log(`✅ Email ${messageId} marked as read`);
  } catch (error) {
    console.error("❌ Error marking email as read:", error);
  }
}

// Reply email papah dengan pesan kustom (text body) dan melampirkan file hasil generate jika ada
async function replyWithMessage(originalEmail, messageText, filePaths = []) {
  try {
    const gmail = createGmailClient();

    // Buat email reply dengan mekanisme multipart untuk teks dan attachment
    const boundary = "boundary_nqa_agent";
    const subject = `Re: ${originalEmail.subject}`;

    // Susun isi pesan reply email beserta custom text dari Matrix
    let emailContent = [
      `To: ${originalEmail.from}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${originalEmail.messageId}`,
      `References: ${originalEmail.messageId}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      messageText, // Memasukkan informasi Auditor Matrix ke body email
      "",
    ];

    // Jika ada file hasil generate, buat rincian nama filenya di pesan
    if (filePaths && filePaths.length > 0) {
      emailContent.push("Files:");
      filePaths.forEach((f) => emailContent.push(`- ${path.basename(f)}`));
      emailContent.push("");
    }

    emailContent = emailContent.join("\n");

    // Attach tiap file
    const fs = require("fs");
    //perlu di loop karena isi dari filepath = array yg isinya lebih dari 1
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const fileContent = fs.readFileSync(filePath).toString("base64");

      // Tentukan mime type berdasarkan ekstensi file
      //memberitahu email client jenis file apa yg dilampirkan
      let mimeType = "application/octet-stream";
      if (fileName.endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (fileName.endsWith(".xlsx")) mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (fileName.endsWith(".pdf"))  mimeType = "application/pdf";

      //tambahkan attachment ke dalam pesan email
      emailContent += [
        `--${boundary}`,
        `Content-Type: ${mimeType}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${fileName}"`,
        "",
        fileContent,
        "",
      ].join("\n");
    }

    emailContent += `--${boundary}--`;

    // Encode email ke base64 untuk Gmail API
    const encodedEmail = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedEmail },
    });

    console.log(`✅ Reply sent. Files attached: ${filePaths ? filePaths.length : 0}`);
  } catch (error) {
    console.error("❌ Error sending reply:", error);
    throw error;
  }
}

module.exports = { getUnreadEmails, markAsRead, replyWithMessage };