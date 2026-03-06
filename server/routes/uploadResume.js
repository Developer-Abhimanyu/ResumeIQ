import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";

const router = express.Router();

/* ======================
   Multer (Memory Storage)
====================== */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
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

    console.log("📄 FILE RECEIVED:", req.file.originalname);
    console.log("📦 FILE TYPE:", req.file.mimetype);

    const fileType = req.file.mimetype;
    const fileBuffer = req.file.buffer;

    let extractedText = "";

    /* ======================
       PDF
    ====================== */

    if (fileType === "application/pdf") {

      console.log("📑 PROCESSING PDF");

      const data = await pdf(fileBuffer);

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
        buffer: fileBuffer
      });

      extractedText = result.value;

    }

    /* ======================
       TXT
    ====================== */

    else if (fileType === "text/plain") {

      console.log("📄 PROCESSING TXT");

      extractedText = fileBuffer.toString("utf8");

    }

    /* ======================
       Unsupported
    ====================== */

    else {

      console.log("❌ UNSUPPORTED FILE TYPE:", fileType);

      return res.status(400).json({
        success: false,
        error: "UNSUPPORTED_FILE"
      });

    }

    if (!extractedText || extractedText.trim().length === 0) {

      console.log("❌ TEXT EXTRACTION FAILED");

      return res.status(500).json({
        success: false,
        error: "TEXT_EXTRACTION_FAILED"
      });

    }

    console.log("✅ TEXT EXTRACTED");
    console.log("📊 TEXT LENGTH:", extractedText.length);

    return res.status(200).json({
      success: true,
      text: extractedText
    });

  } catch (err) {

    console.error("🔥 UPLOAD ERROR FULL:", err);

    return res.status(500).json({
      success: false,
      error: "UPLOAD_FAILED",
      message: err.message
    });

  }

});

export default router;