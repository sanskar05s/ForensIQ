import fitz  # PyMuPDF
import easyocr
import numpy as np
from PIL import Image
from docx import Document
import io
import logging

logger = logging.getLogger(__name__)

_ocr_reader = None


def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
    return _ocr_reader


def extract_from_pdf(file_path: str) -> dict:
    """
    Extracts text from PDF using PyMuPDF.
    If no text layer found (scanned PDF), falls back to EasyOCR
    on rasterized page images.
    Returns {text, method, page_count, char_count}
    """
    doc = fitz.open(file_path)
    page_count = len(doc)
    full_text = ""
    method = "text_layer"

    for page in doc:
        page_text = page.get_text().strip()
        full_text += page_text + "\n"

    full_text = full_text.strip()

    # If no text found, it is likely a scanned PDF — fall back to OCR
    if len(full_text) < 20:
        method = "ocr_fallback"
        full_text = ""
        reader = get_ocr_reader()
        for page in doc:
            # Rasterize page to image
            mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better OCR accuracy
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            img_array = np.array(img)
            results = reader.readtext(img_array)
            page_text = " ".join(
                [text for (_, text, conf) in results if conf > 0.5]
            )
            full_text += page_text + "\n"
        full_text = full_text.strip()

    doc.close()
    return {
        "text": full_text,
        "method": method,
        "page_count": page_count,
        "char_count": len(full_text),
    }


def extract_from_docx(file_path: str) -> dict:
    """
    Extracts text from DOCX using python-docx.
    Returns {text, method, paragraph_count, char_count}
    """
    doc = Document(file_path)
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(paragraphs)
    return {
        "text": full_text,
        "method": "docx_parser",
        "paragraph_count": len(paragraphs),
        "char_count": len(full_text),
    }


def extract_from_text(file_path: str) -> dict:
    """Reads plain text files directly."""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    return {
        "text": content,
        "method": "plain_text",
        "char_count": len(content),
    }


def extract_text(file_path: str, mime_type: str) -> dict:
    """
    Routes to the correct extractor based on mime_type.
    Returns extraction result dict with at minimum: {text, method, char_count}
    On failure returns: {text: "", method: "failed", error: str}
    """
    try:
        if "pdf" in mime_type:
            return extract_from_pdf(file_path)
        elif "wordprocessingml" in mime_type or "msword" in mime_type:
            return extract_from_docx(file_path)
        elif "text/plain" in mime_type:
            return extract_from_text(file_path)
        else:
            # Unknown document type — attempt OCR as last resort
            reader = get_ocr_reader()
            img = Image.open(file_path).convert("RGB")
            results = reader.readtext(np.array(img))
            text = " ".join([t for (_, t, c) in results if c > 0.5])
            return {"text": text, "method": "ocr_fallback", "char_count": len(text)}
    except Exception as e:
        logger.error(f"Text extraction failed for {file_path}: {e}")
        return {"text": "", "method": "failed", "error": str(e), "char_count": 0}
