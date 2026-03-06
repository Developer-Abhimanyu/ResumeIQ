import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParseLib = require("pdf-parse");
const pdfParse = pdfParseLib.default || pdfParseLib;

const router = express.Router();

const upload = multer({ dest: "uploads/" });

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

      const data = await pdfParse(dataBuffer);

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
       INVALID FILE
    ====================== */

    else {

      fs.unlinkSync(filePath);

      return res.status(400).json({
        error: "UNSUPPORTED_FILE"
      });

    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      text: extractedText
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "UPLOAD_FAILED"
    });

  }

});

export default router;