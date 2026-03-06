import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js";

const router = express.Router();

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

router.post("/upload-resume", upload.single("resume"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE" });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;

    let extractedText = "";

    /* ======================
       PDF
    ====================== */

    if (fileType === "application/pdf") {

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

      const result = await mammoth.extractRawText({
        path: filePath
      });

      extractedText = result.value;

    }

    /* ======================
       TXT
    ====================== */

    else if (fileType === "text/plain") {

      extractedText = fs.readFileSync(filePath, "utf8");

    }

    /* ======================
       Unsupported
    ====================== */

    else {

      fs.unlinkSync(filePath);

      return res.status(400).json({
        error: "UNSUPPORTED_FILE"
      });

    }

    /* ======================
       Clean temp file
    ====================== */

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      text: extractedText
    });

  } catch (err) {

    console.error("Upload error:", err);

    if (req.file) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: "UPLOAD_FAILED"
    });

  }

});

export default router;