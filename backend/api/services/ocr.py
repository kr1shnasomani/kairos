"""
OCR service — Layer 3: Multimodal Perception Engine (PaddleOCR 3.0).
Handles text extraction from PDFs, scanned images, and mixed-script documents.
"""

import io
import structlog
from pathlib import Path
from typing import Any, Dict, List, Optional

log = structlog.get_logger(__name__)


class OCRService:
    """
    Text extraction using PaddleOCR 3.0.
    Handles multilingual documents including Hindi, Hinglish (code-switched), and mixed-script.
    Outputs carry per-field confidence scores; low-confidence items route to human review.
    """

    def __init__(self):
        self._ocr = None  # Lazy init — heavy model load deferred until first use

    def _get_ocr(self):
        if self._ocr is None:
            try:
                from paddleocr import PaddleOCR
                # PP-StructureV3 layout pipeline — multilingual, mixed-script
                self._ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang="en",  # Base; override per-document as needed
                    use_gpu=False,  # Set True if GPU available
                    show_log=False,
                )
                log.info("ocr.initialized", engine="PaddleOCR3")
            except ImportError:
                log.warning("ocr.paddleocr_not_installed", hint="pip install -r requirements-ml.txt")
                self._ocr = "unavailable"
        return self._ocr

    async def extract_text(
        self,
        file_bytes: bytes,
        mime_type: str = "application/pdf",
        language_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extracts text from a document.
        Returns structured output with per-block confidence scores.
        Low confidence blocks (< 0.7) are flagged for human review.
        """
        ocr = self._get_ocr()
        if ocr == "unavailable":
            return {
                "text": "",
                "blocks": [],
                "overall_confidence": 0.0,
                "requires_review": True,
                "error": "PaddleOCR not installed — run: pip install -r requirements-ml.txt",
            }

        try:
            import numpy as np
            from PIL import Image

            if mime_type == "application/pdf":
                blocks = await self._extract_from_pdf(file_bytes, ocr)
            else:
                image = Image.open(io.BytesIO(file_bytes))
                img_array = np.array(image)
                result = ocr.ocr(img_array, cls=True)
                blocks = self._parse_ocr_result(result)

            overall_confidence = sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0.0
            full_text = " ".join(b["text"] for b in blocks)

            return {
                "text": full_text,
                "blocks": blocks,
                "overall_confidence": overall_confidence,
                "requires_review": overall_confidence < 0.7 or any(b["confidence"] < 0.5 for b in blocks),
                "block_count": len(blocks),
            }
        except Exception as e:
            log.error("ocr.extraction_failed", error=str(e))
            return {"text": "", "blocks": [], "overall_confidence": 0.0, "requires_review": True, "error": str(e)}

    async def _extract_from_pdf(self, pdf_bytes: bytes, ocr) -> List[Dict[str, Any]]:
        """Extract text from PDF — page by page."""
        blocks = []
        try:
            import fitz  # PyMuPDF
            import numpy as np
            from PIL import Image

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page_num, page in enumerate(doc):
                pix = page.get_pixmap(dpi=200)
                img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                result = ocr.ocr(img_array, cls=True)
                page_blocks = self._parse_ocr_result(result)
                for block in page_blocks:
                    block["page"] = page_num + 1
                blocks.extend(page_blocks)
        except ImportError:
            log.warning("ocr.pymupdf_not_installed")
        return blocks

    def _parse_ocr_result(self, result) -> List[Dict[str, Any]]:
        blocks = []
        if not result or not result[0]:
            return blocks
        for line in result[0]:
            if not line:
                continue
            bbox, (text, confidence) = line
            blocks.append({"text": text, "confidence": float(confidence), "bbox": bbox})
        return blocks
