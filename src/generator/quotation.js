const pizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

async function generateQuotation(clientData) {
    try {
        //1. baca templatenya dulu di folder template
        const templatePath = path.join(__dirname, "../../template/quotation.docx");
        const content = fs.readFileSync(templatePath, "binary");

        //2. load ke pizzip + docxtemplater
        const zip = new pizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        //3. isi semua placeholdernya dengan data dari klien
        doc.render({
            company_name: clientData.company_name,
            company_address: clientData.company_address,
            standards: clientData.standards,
            scope: clientData.scope,
            quotation_ref: clientData.quotation_ref,

            //mandays
            mandays_initial: clientData.mandays_initial,

            //fees
            fee_surveillance_1: clientData.fee_surveillance_1,
            fee_surveillance_2: clientData.fee_surveillance_2,
            fee_recertification: clientData.fee_recertification,

            //due dates
            due_date_surveillance_1: clientData.due_date_surveillance_1,
            due_date_surveillance_2: clientData.due_date_surveillance_2,
            due_date_recertification: clientData.due_date_recertification,

            //tanda tangan
            client_name: clientData.client_name,
            date: clientData.date,
        });

        //4. generate output
        const output = doc.getZip().generate({ type: "nodebuffer" });

        //5. save ke folder output
        const outputFile = `Quotation_${clientData.company_name}_${Date.now()}.docx`
        const outputPath = path.join(__dirname, "../../output", outputFileName);
        fs.writeFileSync(outputPath, output);

        console.log(`Quotation generated: ${outputFile}`);
        return outputPath;
    } catch (error) {
        console.error('Error generating quotation', error);
        throw error;
    }
}

module.exports = { generateQuotation };