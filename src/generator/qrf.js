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
    const standards = clientData.standards || []; // contoh: ["9001", "45001", "ISO 9001"]

    // Centang ISO yg dipilih klien sesuai posisi koordinat di PDF
    if (standards.some(s => s.includes("9001")))  form.getCheckBox("Check Box 261").check();  // ISO 9001:2015  - x=362, y=371
    if (standards.some(s => s.includes("14001"))) form.getCheckBox("Check Box 258").check(); // ISO 14001:2015 - x=548, y=371
    if (standards.some(s => s.includes("45001"))) form.getCheckBox("Check Box 255").check(); // ISO 45001:2018 - x=174, y=343
    if (standards.some(s => s.includes("27001"))) form.getCheckBox("Check Box 263").check(); // ISO 27001:2022 - x=362, y=316
    if (standards.some(s => s.includes("50001"))) form.getCheckBox("Check Box 262").check(); // ISO 50001:2018 - x=548, y=343
    if (standards.some(s => s.includes("13485"))) form.getCheckBox("Check Box 259").check(); // ISO 13485      - x=174, y=316

    // SECTION 3 - Integrated Management System
    // Kalau lebih dari 1 ISO dipilih, centang Yes - Full (Check Box 57)
    // Kalau hanya 1 ISO = centang No (Check Box 59)
    // Check Box 57 = Yes-Full (x=245 y=200), 58 = Yes-Partial (x=309), 59 = No (x=373)
    if (standards.length > 1) {
      form.getCheckBox("Check Box 57").check(); // Yes - Full
    } else {
      form.getCheckBox("Check Box 59").check(); // No
    }

    // SECTION 4 - Employees
    // Total jumlah karyawan (field header "No. of staff" dan juga total di bawah tabel breakdown)
    const totalEmp = parseInt(clientData.total_employees) || 0;

    // Isi field core hours dengan total karyawan
    form.getTextField("Text Field 285").setText(String(totalEmp)); // Core hours = semua karyawan
    form.getTextField("Text Field 284").setText("");               // Shift 1 = kosong
    form.getTextField("Text Field 283").setText("");               // Shift 2 = kosong
    form.getTextField("Text Field 282").setText("");               // Shift 3 = kosong
    form.getTextField("Text Field 281").setText(String(totalEmp)); // Total no. of employees (header)

    // SECTION 4b - Task Breakdown
    // Pecah total ke kategori tugas: jika dijumlah semua harus tepat = totalEmp
    // Pakai Math.floor agar tidak ada desimal, lalu sisa dimasukkan ke 'other'
    const opsOffice = Math.floor(totalEmp * 0.50); // Operations/Delivery - office (50%)
    const opsField2 = Math.floor(totalEmp * 0.20); // Operations/Delivery - field  (20%)
    const mgmt2     = Math.floor(totalEmp * 0.10); // Management                   (10%)
    const finance   = Math.floor(totalEmp * 0.05); // Finance                       (5%)
    const hr        = Math.floor(totalEmp * 0.05); // HR                            (5%)
    // Other menyerap sisa agar total tepat (rumus: total - semua yg sudah dialokasi)
    const other     = totalEmp - opsOffice - opsField2 - mgmt2 - finance - hr;

    form.getTextField("Text Field 29").setText("");                    // Sales         = kosong
    form.getTextField("Text Field 30").setText(String(opsOffice));     // Ops - office
    form.getTextField("Text Field 31").setText("");                    // R&D           = kosong
    form.getTextField("Text Field 32").setText("");                    // Marketing     = kosong
    form.getTextField("Text Field 33").setText(String(opsField2));     // Ops - field
    form.getTextField("Text Field 34").setText(String(mgmt2));         // Management
    form.getTextField("Text Field 35").setText(String(finance));       // Finance
    form.getTextField("Text Field 36").setText("");                    // Compliance    = kosong
    form.getTextField("Text Field 37").setText(String(other));         // Other (termasuk sisa)
    form.getTextField("Text Field 38").setText(String(hr));            // HR
    form.getTextField("Text Field 39").setText("");                    // Maintenance   = kosong
    form.getTextField("Text Field 42").setText(String(totalEmp));      // Total no. of employees

    // SECTION 5 - Client Type
    // Jenis klien: baru, existing, atau transfer
    // Karena agent hanya jalan kalau ada klien baru,
    // "new client" selalu dicentang "Yes" (Check Box 177)
    form.getCheckBox("Check Box 177").check(); // A new client - Yes

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
    if (standards.some(s => s.includes("9001"))) {
      if (clientData.has_design_development === true) {
        form.getCheckBox("Check Box 108").check();
        form.getTextField("Text Field 101").setText(String(clientData.design_staff_count || ""));
      } else if (clientData.has_design_development === false) {
        form.getCheckBox("Check Box 109").check();
      }
    }

    // SECTION B - ISO 14001 spesifik
    if (standards.some(s => s.includes("14001"))) {
      const b = clientData.iso_14001_details || {};
      
      // 1. Permit required?
      if (b.permit_required === true) form.getCheckBox("Check Box 1010").check();
      else if (b.permit_required === false) form.getCheckBox("Check Box 1011").check();

      // 2. Discharges to water
      if (b.discharges === "Frequently") form.getCheckBox("Check Box 222").check();
      else if (b.discharges === "Occasionally") form.getCheckBox("Check Box 220").check();
      else if (b.discharges === "Never") form.getCheckBox("Check Box 221").check();

      // 3. Waste
      if (b.waste === "Frequently") form.getCheckBox("Check Box 225").check();
      else if (b.waste === "Occasionally") form.getCheckBox("Check Box 223").check();
      else if (b.waste === "Never") form.getCheckBox("Check Box 224").check();

      // 4. Noise and nuisance
      if (b.noise === "Frequently") form.getCheckBox("Check Box 228").check();
      else if (b.noise === "Occasionally") form.getCheckBox("Check Box 226").check();
      else if (b.noise === "Never") form.getCheckBox("Check Box 227").check();

      // 5. Incidents
      if (b.incidents === true) form.getCheckBox("Check Box 1063").check();
      else if (b.incidents === false) form.getCheckBox("Check Box 1064").check();
    }

    // SECTION C - ISO 45001 spesifik
    // Hanya diisi kalau klien pilih ISO 45001
    if (standards.some(s => s.includes("45001"))) {
      // Pemetaan hazards (berdasarkan tebakan pintar Groq)
      const h = clientData.iso_45001_hazards || [];
      const hazardMap = {
        "asbestos": { cb: "Check Box 1031", tf: "Text Field 106" },
        "explosives": { cb: "Check Box 1032", tf: "Text Field 107" },
        "flammable": { cb: "Check Box 1033", tf: "Text Field 108" },
        "dangerous_goods": { cb: "Check Box 1034", tf: "Text Field 109" },
        "underwater": { cb: "Check Box 1035", tf: "Text Field 1010" },
        "extreme_temps": { cb: "Check Box 1036", tf: "Text Field 1011" },
        "dangerous_animals": { cb: "Check Box 1037", tf: "Text Field 1012" },
        "water_proximity": { cb: "Check Box 1038", tf: "Text Field 1013" },
        "gas": { cb: "Check Box 1039", tf: "Text Field 1014" },
        "radiation": { cb: "Check Box 1040", tf: "Text Field 1015" },
        "lifting_equipment": { cb: "Check Box 1041", tf: "Text Field 1016" },
        "biological": { cb: "Check Box 1042", tf: "Text Field 1017" },
        "moving_vehicles": { cb: "Check Box 1043", tf: "Text Field 1018" },
        "food_prep": { cb: "Check Box 1044", tf: "Text Field 1019" }
      };
      
      h.forEach(hz => {
        if (hz && hz.hazard && hazardMap[hz.hazard]) {
          try { 
            form.getCheckBox(hazardMap[hz.hazard].cb).check(); 
            if (hz.process) {
              form.getTextField(hazardMap[hz.hazard].tf).setText(String(hz.process));
            }
          } catch (e) {}
        }
      });

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