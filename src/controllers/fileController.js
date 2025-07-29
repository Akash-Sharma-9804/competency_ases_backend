const uploadToFTP = require("../utils/ftpUploader");
const extractText = require("../utils/textExtractor");
const UploadedFile = require("../models/UploadedFile");

exports.uploadFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const uploadedRecords = [];

    console.log("🧭 [Upload] Auth info:", req.auth);

    for (const file of req.files) {
      const buffer = file.buffer;
      const mimeType = file.mimetype;
      const originalName = file.originalname;

      console.log(`⬆️ [Upload] Processing file: ${originalName}`);

      // upload to FTP
      const ftpUrl = await uploadToFTP(buffer, originalName);

      // extract text
      const extracted = await extractText(buffer, mimeType, originalName, ftpUrl);

      // decide company_id and user_id
      let companyId = null;
      let userId = null;

      if (req.auth.role === "company") {
        // company upload
        companyId = req.auth.company_id || req.auth.id;
        userId = null;
        console.log(`🏢 [Upload] Company upload, company_id=${companyId}`);
      } else if (req.auth.role === "user") {
        // user upload
        userId = req.auth.id;
        companyId = req.auth.company_id || null; // optional, might be null
        console.log(`👤 [Upload] User upload, user_id=${userId}, company_id=${companyId}`);
      } else {
        console.warn("⚠️ [Upload] Unknown role, defaulting both to null");
      }

      // save in DB
      const record = await UploadedFile.create({
        company_id: companyId,
        user_id: userId,
        original_filename: originalName,
        unique_filename: ftpUrl.split("/").pop(),
        ftp_path: ftpUrl,
        mime_type: mimeType,
        extracted_text: extracted
      });

      uploadedRecords.push(record);
    }

    console.log(`✅ [Upload] ${uploadedRecords.length} file(s) uploaded`);
    return res.json({ message: "✅ Files uploaded and processed", files: uploadedRecords });
  } catch (err) {
    console.error("❌ [Upload] Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


