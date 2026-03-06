import express from "express";
import multer from "multer";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import fs from "fs";

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

    if (fileType === "application/pdf") {

      const data = await pdf(fs.readFileSync(filePath));
      extractedText = data.text;

    } else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {

      const result = await mammoth.extractRawText({
        path: filePath
      });

      extractedText = result.value;

    } else if (fileType === "text/plain") {

      extractedText = fs.readFileSync(filePath, "utf8");

    } else {

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