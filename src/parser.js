const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { getEacList, getAuditorInitialsList } = require("./matrix");

// Format email yang papah kirim:
// Subject: NEW CLIENT - PT. Nama Perusahaan
//
// Nama Perusahaan: PT. ABC Indonesia
// Alamat: Jl. Contoh No. 123, Surabaya
// Jumlah Karyawan: 25
// ISO: 9001, 45001
// Scope: Manufacture of plastic products
// Industri: Rubber and plastic products
// Auditor: Alfons Dolly
// Catatan: client baru, integrated audit

async function parseEmailToClientData(emailSubject, emailBody) {
    try {
        // Ambil daftar EAC/IAF Code dari Matriks Excel untuk dijadikan referensi/contekan bagi Groq AI
        const eacList = await getEacList();
        const eacString = eacList.map(e => `${e.code}=${e.description}`).join(", ");
        
        // Ambil daftar inisial auditor dari Matriks Excel agar Groq tidak mengarang nama inisial
        const initialsList = await getAuditorInitialsList();
        const initialsString = initialsList.join(", ");

        // Kirim email body ke Groq API
        // Groq akan ekstrak semua data yang dibutuhkan
        // dan kembalikan dalam format JSON
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        // System prompt = instruksi ke Groq tentang tugasnya
                        // Semakin detail instruksinya, semakin akurat hasilnya
                        content: `Kamu adalah asisten yang bertugas mengekstrak data klien baru dari email untuk keperluan audit ISO NQA Indonesia.

Ekstrak data berikut dari email dan kembalikan HANYA dalam format JSON, tanpa teks lain, tanpa markdown, tanpa backticks.

Format JSON yang harus dikembalikan:
{
  "company_name": "nama perusahaan lengkap (prioritaskan ambil dari SUBJECT email)",
  "address": "alamat lengkap",
  "contact_name": "nama kontak person",
  "job_title": "jabatan kontak person",
  "email": "email klien",
  "phone": "nomor telepon",
  "mobile": "nomor hp",
  "website": "website perusahaan",
  "postcode": "kode pos",
  "total_employees": angka jumlah karyawan (integer),
  "standards": ["9001", "45001"],
  "scope": "deskripsi scope sertifikasi",
  "iaf_code": angka kode industri IAF (integer),
  "iaf_description": "deskripsi industri",
  "auditor_name": "inisial auditor dari daftar (misal PT, DT, dll)",
  "auditor_role": "Lead Auditor",
  "contract_type": "Initial",
  "has_client_sites": true atau false,
  "has_outsourced": false atau true,
  "outsourced_details": "detail outsourced kalau ada",
  "implementation_stage": "researching atau implementing atau system_in_place atau already_certified",
  "target_audit_date": "tanggal target audit kalau disebutkan",
  "using_consultant": false atau true,
  "consultant_info": "info konsultan kalau ada",
  "has_design_development": true atau false,
  "design_staff_count": angka kalau ada,
  "public_present": false atau true,
  "integration_details": "detail integrasi kalau lebih dari 1 ISO",
  "completed_by": "nama yang mengisi CR (dari email pengirim)",
  "quotation_ref": "",
  "client_name": "nama direktur atau kontak yang tanda tangan",
  "date": "${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}",
  "mandays_initial": "",
  "fee_surveillance_1": "",
  "fee_surveillance_2": "",
  "fee_recertification": "",
  "due_date_surveillance_1": "",
  "due_date_surveillance_2": "",
  "due_date_recertification": "",
  "iso_14001_details": {
    "permit_required": false,
    "discharges": "Never",
    "waste": "Occasionally",
    "noise": "Never",
    "incidents": false
  },
  "iso_45001_hazards": []
}

Aturan penting:
- standards harus array of string, contoh: ["9001", "45001"]. Perhatikan singkatan berikut: 9k = "9001", 14k = "14001", 45k = "45001", 27k = "27001", 50k = "50001", 13k = "13485".
- total_employees harus integer, bukan string
- iaf_code tentukan berdasarkan deskripsi industri klien menggunakan referensi kode IAF/EAC berikut:
  ${eacString}
- auditor_name HARUS berupa inisial dari daftar berikut yang cocok dengan nama di email: ${initialsString}. Jika tidak yakin, kembalikan inisial yang paling masuk akal atau kosongi.
- has_client_sites, has_outsourced, using_consultant, has_design_development, public_present harus boolean
- implementation_stage harus salah satu dari: researching, implementing, system_in_place, already_certified
- Kalau data tidak ada di email, isi dengan nilai default: string kosong "", false untuk boolean, 0 untuk angka
- fee dan mandays biarkan kosong string "", akan diisi manual saat review
- contract_type selalu "Initial" untuk klien baru

Aturan khusus Tebakan Pintar AI (AI Guessing):
Jika klien meminta ISO 14001 atau 45001, analisislah 'scope' atau industri mereka dan JAWABLAH dengan logis (kecuali email memberi 'Catatan Khusus' yang menimpa tebakanmu):
- iso_14001_details:
  - permit_required: true jika pabrik/tambang/manufaktur besar, false jika office/IT/jasa.
  - discharges: "Frequently", "Occasionally", atau "Never".
  - waste: "Frequently", "Occasionally", atau "Never".
  - noise: "Frequently", "Occasionally", atau "Never" (misal pabrik besi = Frequently).
  - incidents: tebak false kecuali disebut lain.
- iso_45001_hazards:
  - Berikan array of objects berisi bahaya yang MUNGKIN ADA, dengan format: {"hazard": "nama_bahaya", "process": "deskripsi singkat proses yang berisiko tersebut (maksimal 1 kalimat)"}.
  - Pilihan 'hazard' yang valid HANYA: "asbestos", "explosives", "flammable", "dangerous_goods", "underwater", "extreme_temps", "dangerous_animals", "water_proximity", "gas", "radiation", "lifting_equipment", "biological", "moving_vehicles", "food_prep".
  - Contoh: jika scope "Logistics", masukkan [{"hazard": "moving_vehicles", "process": "mobility of heavy equipment and transportation"}]. Jika "Software", kosongi array [].`
                    },
                    {
                        role: "user",
                        // Kirim subject dan body email ke Groq untuk diparse
                        content: `Ekstrak data klien dari email berikut:\n\nSUBJECT: ${emailSubject}\n\nBODY:\n${emailBody}`
                    }
                ],
                temperature: 0.1 // temperature rendah = hasil lebih konsisten, tidak kreatif
            })
        });

        const data = await response.json();

        // Ambil teks response dari Groq
        const rawText = data.choices[0].message.content.trim();

        // Parse JSON dari response Groq
        const cleanText = rawText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const clientData = JSON.parse(cleanText);
        
        // Penuhi request user: force company_name sama persis dengan subject email
        if (emailSubject) {
            clientData.company_name = emailSubject;
        }

        console.log("✅ Email parsed successfully:", clientData.company_name);
        return clientData;

    } catch (error) {
        console.error("❌ Error parsing email:", error);
        throw error;
    }
}

// Fungsi untuk cek apakah email adalah email klien baru
// Berdasarkan subject email dari papah
function isNewClientEmail(subject, body) {
    const subjectLower = subject.toLowerCase();
    const bodyLower = body.toLowerCase();

    // Cek keyword di subject atau body
    const keywords = [
        "new client",
        "klien baru",
        "client baru",
        "new customer",
        "pelanggan baru"
    ];

    return keywords.some(keyword =>
        subjectLower.includes(keyword) || bodyLower.includes(keyword)
    );
}

// Fungsi untuk menerapkan instruksi revisi dari email ke data klien (JSON)
// Groq AI akan membaca JSON yang lama, menganalisis instruksi revisi, dan mengembalikan JSON baru
async function applyRevisionToData(revisionEmailBody, existingClientData) {
    try {
        const eacList = await getEacList();
        const eacString = eacList.map(e => `${e.code}=${e.description}`).join(", ");
        
        const initialsList = await getAuditorInitialsList();
        const initialsString = initialsList.join(", ");

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `Kamu adalah asisten ahli NQA Indonesia yang bertugas merevisi data klien berdasarkan email feedback.

Berikut adalah data klien SAAT INI dalam format JSON:
${JSON.stringify(existingClientData, null, 2)}

Tugasmu:
1. Baca instruksi revisi dari user.
2. Identifikasi bagian mana dari data klien saat ini yang harus diubah (misalnya NACE code, OHSAS code, scope, jumlah employee, dll).
3. Terapkan perubahan tersebut. Jika ada instruksi yang kurang jelas, buat asumsi paling logis berdasarkan aturan standar.
4. Kembalikan SELURUH data klien dalam format JSON HANYA (tanpa teks penjelasan, tanpa markdown \`\`\`json). Data yang tidak direvisi harus tetap dipertahankan.

Aturan standar tetap berlaku:
- iaf_code referensi: ${eacString}
- auditor_name inisial: ${initialsString}
`
                    },
                    {
                        role: "user",
                        content: `Tolong revisi data klien berdasarkan email feedback berikut:\n\n${revisionEmailBody}`
                    }
                ],
                temperature: 0.1
            })
        });

        const data = await response.json();
        const rawText = data.choices[0].message.content.trim();

        const cleanText = rawText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const updatedClientData = JSON.parse(cleanText);

        console.log("✅ Revision parsed successfully:", updatedClientData.company_name);
        return updatedClientData;

    } catch (error) {
        console.error("❌ Error parsing revision email:", error);
        throw error;
    }
}

module.exports = { parseEmailToClientData, isNewClientEmail, applyRevisionToData };