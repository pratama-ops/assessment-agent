const { PDFDocument } = require("pdf-lib");
const fs = require("fs");

async function getFormFields() {
  const pdfBytes = fs.readFileSync("template/qrf.pdf");
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  fields.forEach((field, index) => {
    const type = field.constructor.name;
    const name = field.getName();
    
    // coba baca nilai existing kalau ada
    let currentValue = "";
    try {
      if (type === "PDFTextField") {
        currentValue = field.getText() || "";
      } else if (type === "PDFCheckBox") {
        currentValue = field.isChecked() ? "CHECKED" : "unchecked";
      }
    } catch (e) {}

    console.log(`[${index}] ${type} | ${name} | value: "${currentValue}"`);
  });
}

getFormFields();