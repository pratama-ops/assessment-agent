const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function generateQRF(clientData) {
  try {
    // Baca file PDF template dari folder template/
    const templatePath = path.join(__dirname, "../../template/qrf 1.pdf");
    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // form = objek yang merepresentasikan semua field interaktif di PDF
    const form = pdfDoc.getForm();

    // SECTION 1 - Organisation Details
    // Data dasar perusahaan klien
    // getTextField = ambil field teks, setText = isi nilainya
    // "Text Field 13" = nama field di PDF (hasil dari check-field.js tadi)
    form.getTextField("Text Field 13").setText(clientData.company_name || "");
    form.getTextField("Text Field 191").setText("Indonesia"); // selalu Indonesia, hardcoded
    form.getTextField("Text Field 14").setText(clientData.address || "");
    form.getTextField("Text Field 15").setText(clientData.postcode || ""); // || "" = kalau kosong, isi string kosong supaya tidak error
    form.getTextField("Text Field 17").setText(clientData.contact_name || "");
    form.getTextField("Text Field 18").setText(clientData.job_title || "");
    form.getTextField("Text Field 19").setText(clientData.email || "");
    form.getTextField("Text Field 20").setText(clientData.phone || "");
    form.getTextField("Text Field 21").setText(clientData.website || "");
    form.getTextField("Text Field 22").setText(clientData.mobile || "");

    // SECTION 2 - Standards
    // ISO apa saja yang diminta klien
    // getCheckBox = ambil field checkbox, .check() = centang
    // Hanya centang yang sesuai, sisanya dibiarkan kosong
    const standards = clientData.standards || []; // contoh: ["9001", "45001"]

    if (standards.includes("9001"))  form.getCheckBox("Check Box 15").check();
    if (standards.includes("14001")) form.getCheckBox("Check Box 57").check();
    if (standards.includes("45001")) form.getCheckBox("Check Box 58").check();
    if (standards.includes("27001")) form.getCheckBox("Check Box 59").check();
    if (standards.includes("50001")) form.getCheckBox("Check Box 166").check();
    if (standards.includes("13485")) form.getCheckBox("Check Box 229").check();

    // SECTION 3 - Integrated Management System
    // Apakah beberapa ISO digabung dalam satu sistem manajemen
    // Kalau klien pilih lebih dari 1 ISO = otomatis dianggap integrated
    // Kalau hanya 1 ISO = centang No
    if (standards.length > 1) {
      form.getCheckBox("Check Box 255").check(); // Yes - Full
      form.getTextField("Text Field 279").setText(clientData.integration_details || "");
    } else {
      form.getCheckBox("Check Box 257").check(); // No
    }

    // SECTION 4 - Employees
    // Total jumlah karyawan di perusahaan klien
    // String() = konversi angka ke teks karena setText butuh string
    // Text Field 42 = kolom "Total no of employees" di section 4
    form.getTextField("Text Field 42").setText(String(clientData.total_employees || ""));

    // SECTION 5 - Client Type
    // Jenis klien: baru, existing, atau transfer
    // Karena agent hanya jalan kalau ada klien baru,
    // "new client" selalu dicentang (hardcoded)
    form.getCheckBox("Check Box 258").check(); // A new client - selalu dicentang

    // SECTION 6 - Scope of Certification
    // Deskripsi singkat apa yang dilakukan perusahaan klien
    // contoh: "Manufacture of upvc profiling (windows, doorframes)"
    // Text Field 271 = field scope di section 6
    form.getTextField("Text Field 271").setText(clientData.scope || "");

    // SECTION 7 - Client Sites
    // Apakah klien melakukan pekerjaan di lokasi pelanggan mereka
    if (clientData.has_client_sites) {
      form.getCheckBox("Check Box 98").check();  // Yes
    } else {
      form.getCheckBox("Check Box 99").check();  // No
    }

    // SECTION 8 - Outsourced Activities
    // Apakah klien punya aktivitas yang dioutsource ke pihak lain
    // Text Field 277 = field detail outsourced di section 8
    if (clientData.has_outsourced) {
      form.getTextField("Text Field 277").setText(clientData.outsourced_details || "");
    }
    // section 9, 11a, 11b, 11c dibiarkan kosong — tidak relevan untuk semua klien

    // SECTION 12 - Target Assessment Date
    // Kapan klien mau mulai diaudit
    form.getTextField("Text Field 276").setText(clientData.target_audit_date || "");

    // SECTION 13 - Implementation Stage
    // Seberapa jauh klien sudah implement sistem manajemennya
    // researching = baru riset
    // implementing = sedang implementasi
    // system_in_place = sudah ada sistemnya
    // already_certified = sudah pernah sertifikasi sebelumnya
    const stage = clientData.implementation_stage || "";
    if (stage === "researching")       form.getCheckBox("Check Box 230").check();
    if (stage === "implementing")      form.getCheckBox("Check Box 231").check();
    if (stage === "system_in_place")   form.getCheckBox("Check Box 232").check();
    if (stage === "already_certified") form.getCheckBox("Check Box 233").check();

    // SECTION 14 - Consultant
    // Apakah klien pakai konsultan untuk bantu implementasi
    // default kosong — hanya diisi kalau ada info consultant dari email
    if (clientData.using_consultant === true) {
      form.getCheckBox("Check Box 264").check(); // Yes
      form.getTextField("Text Field 1046").setText(clientData.consultant_info || "");
    }

    // SECTION A - ISO 9001 spesifik
    // Hanya diisi kalau klien pilih ISO 9001
    // Pertanyaan: apakah klien melakukan design & development produk?
    if (standards.includes("9001")) {
      if (clientData.has_design_development === true) {
        form.getCheckBox("Check Box 108").check();
        form.getTextField("Text Field 101").setText(String(clientData.design_staff_count || ""));
      } else if (clientData.has_design_development === false) {
        form.getCheckBox("Check Box 109").check();
      }
    }

    // SECTION C - ISO 45001 spesifik
    // Hanya diisi kalau klien pilih ISO 45001
    // Berisi info K3: jumlah karyawan, apakah ada anggota publik di lokasi
    if (standards.includes("45001")) {
      // Apakah ada anggota masyarakat umum yang hadir di lokasi kerja klien
      if (clientData.public_present === true) {
        form.getCheckBox("Check Box 1056").check(); // Yes
      } else if (clientData.public_present === false) {
        form.getCheckBox("Check Box 1058").check(); // No
      }
    }

    //simpan file pdf nya
    const outputBytes = await pdfDoc.save();
    const outputFileName = `QRF_${clientData.company_name}_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, "../../output", outputFileName);
    fs.writeFileSync(outputPath, outputBytes);

    console.log(`✅ QRF generated: ${outputFileName}`);
    return outputPath;

  } catch (error) {
    console.error("❌ Error generating QRF:", error);
    throw error;
  }
}

module.exports = { generateQRF };