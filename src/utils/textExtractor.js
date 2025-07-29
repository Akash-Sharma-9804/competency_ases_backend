// ✅ No need to import node-fetch in Node 18+
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const JSZip = require("jszip");

async function extractText(buffer, mimeType, originalFileName, ftpUrl) {
  console.log("📝 [extractText] Starting extraction...");
  console.log("📄 Original file:", originalFileName);
  console.log("📦 Mime type:", mimeType);
  console.log("🌐 FTP URL:", ftpUrl);

  let text = "";

  try {
    // PDF → Mistral OCR
    if (mimeType === "application/pdf") {
      console.log("🔎 PDF detected. Sending to Mistral OCR API...");
      const response = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: "mistral-ocr-latest",
          document: { type: "document_url", document_url: ftpUrl },
          include_image_base64: false,
        }),
      });
      console.log("📡 Waiting for Mistral response...");
      const data = await response.json();
      console.log("✅ Mistral OCR response received");
      text = data.pages?.map(p => p.markdown).join("\n") || "";
    }

    else if (mimeType === "text/plain") {
      console.log("📄 Plain text detected.");
      text = buffer.toString("utf-8");
    }

    else if (mimeType.includes("wordprocessingml.document")) {
      console.log("📄 DOCX detected. Using Mammoth...");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }

    else if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      console.log("📊 Excel detected. Parsing...");
      const workbook = xlsx.read(buffer, { type: "buffer" });
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        text += xlsx.utils.sheet_to_csv(sheet);
      });
    }

    else if (mimeType.includes("presentation")) {
      console.log("📑 PPTX detected. Extracting slides...");
      const zip = await JSZip.loadAsync(buffer);
      for (const [filename, file] of Object.entries(zip.files)) {
        if (filename.startsWith("ppt/slides/slide") && filename.endsWith(".xml")) {
          const slideXml = await file.async("text");
          const slideText = slideXml.replace(/<[^>]*>/g, " ");
          text += slideText;
        }
      }
    }

    console.log("🧹 Cleaning text...");
    text = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s{2,}/g, " ")
      .trim();

    console.log("✅ Extraction done. Length:", text.length);
    return text;
  } catch (err) {
    console.error("❌ [extractText] Error:", err);
    throw err;
  }
}

module.exports = extractText;
