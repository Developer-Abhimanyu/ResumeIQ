import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js";

const router = express.Router();

/* ======================
   Ensure uploads folder exists
====================== */

const uploadDir = "uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ======================
   Multer setup
====================== */

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/* ======================
   Upload Route
====================== */

router.post("/upload-resume", upload.single("resume"), async (req, res) => {

  console.log("=========== UPLOAD ROUTE HIT ===========");

  try {

    if (!req.file) {

      console.log("❌ NO FILE RECEIVED");

      return res.status(400).json({
        success: false,
        error: "NO_FILE"
      });

    }

    console.log("📄 FILE RECEIVED:", req.file);

    const filePath = req.file.path;
    const fileType = req.file.mimetype;

    console.log("📦 FILE TYPE:", fileType);
    console.log("📍 FILE PATH:", filePath);

    let extractedText = "";

    /* ======================
       PDF
    ====================== */

    if (fileType === "application/pdf") {

      console.log("📑 PROCESSING PDF");

      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);

      extractedText = data.text;

    }

    /* ======================
       DOCX
    ====================== */

    else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {

      console.log("📝 PROCESSING DOCX");

      const result = await mammoth.extractRawText({
        path: filePath
      });

      extractedText = result.value;

    }

    /* ======================
       TXT
    ====================== */

    else if (fileType === "text/plain") {

      console.log("📄 PROCESSING TXT");

      extractedText = fs.readFileSync(filePath, "utf8");

    }

    /* ======================
       Unsupported file
    ====================== */

    else {

      console.log("❌ UNSUPPORTED FILE TYPE:", fileType);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.status(400).json({
        success: false,
        error: "UNSUPPORTED_FILE"
      });

    }

    /* ======================
       Cleanup temp file
    ====================== */

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("✅ TEXT EXTRACTED");
    console.log("📊 TEXT LENGTH:", extractedText.length);

    return res.status(200).json({
      success: true,
      text: extractedText
    });

  } catch (err) {

    console.error("🔥 UPLOAD ERROR FULL:", err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      error: "UPLOAD_FAILED",
      message: err.message
    });

  }

});

export default router;