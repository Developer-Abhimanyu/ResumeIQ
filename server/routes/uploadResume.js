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
  fs.mkdirSync(uploadDir);
}

/* ======================
   Multer setup
====================== */

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

/* ======================
   Upload Route
====================== */

router.post("/upload-resume", upload.single("resume"), async (req, res) => {

  console.log("UPLOAD ROUTE HIT");

  try {

    if (!req.file) {
      console.log("NO FILE RECEIVED");
      return res.status(400).json({ error: "NO_FILE" });
    }

    console.log("FILE RECEIVED:", req.file);

    const filePath = req.file.path;
    const fileType = req.file.mimetype;

    console.log("FILE TYPE:", fileType);

    let extractedText = "";

    /* ===== PDF ===== */

    if (fileType === "application/pdf") {

      console.log("PROCESSING PDF");

      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);

      extractedText = data.text;

    }

    /* ===== DOCX ===== */

    else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {

      console.log("PROCESSING DOCX");

      const result = await mammoth.extractRawText({
        path: filePath
      });

      extractedText = result.value;

    }

    /* ===== TXT ===== */

    else if (fileType === "text/plain") {

      console.log("PROCESSING TXT");

      extractedText = fs.readFileSync(filePath, "utf8");

    }

    /* ===== Unsupported ===== */

    else {

      console.log("UNSUPPORTED FILE TYPE");

      fs.unlinkSync(filePath);

      return res.status(400).json({
        error: "UNSUPPORTED_FILE"
      });

    }

    fs.unlinkSync(filePath);

    console.log("TEXT LENGTH:", extractedText.length);

    res.json({
      success: true,
      text: extractedText
    });

  } catch (err) {

    console.error("UPLOAD ERROR FULL:", err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: "UPLOAD_FAILED",
      message: err.message
    });

  }

});

export default router;