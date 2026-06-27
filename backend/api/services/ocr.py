"""
OCR service — Layer 3: Multimodal Perception Engine (PaddleOCR 3.0).
Handles text extraction from PDFs, scanned images, and mixed-script documents.

Extraction strategy (in order):
1. Native PDF text via PyMuPDF  — fast, high confidence for digital PDFs
2. PaddleOCR 3.0                — full OCR for scanned/image-only documents
3. Unavailable fallback          — returns requires_review=True for human processing
"""

import io
import structlog
from typing import Any, Dict, List, Optional

log = structlog.get_logger(__name__)


class OCRService:
    """
    Text extraction using PaddleOCR 3.0 with PyMuPDF native text as the primary path.
    Handles multilingual documents including Hindi, Hinglish, and mixed-script.
    Outputs carry per-field confidence scores; low-confidence items route to human review.
    """

    def __init__(self):
        self._ocr = None  # Lazy init — heavy model load deferred until first use

    def _get_ocr(self):
        if self._ocr is None:
            try:
                from paddleocr import PaddleOCR
                self._ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang="en",
                    use_gpu=False,
                    show_log=False,
                )
                log.info("ocr.initialized", engine="PaddleOCR3")
            except ImportError:
                log.warning("ocr.paddleocr_not_installed", hint="pip install paddlepaddle paddleocr")
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
        For digital PDFs, tries native text extraction first (fast, reliable).
        Falls back to PaddleOCR for scanned/image-only documents.
        Returns structured output with per-block confidence scores.
        Low overall confidence (< 0.7) or any block below 0.5 flags for human review.
        """
        if mime_type == "application/pdf":
            native = await self._extract_native_pdf_text(file_bytes)
            if native["blocks"]:
                # Native text found — digital PDF, high confidence
                log.info("ocr.native_text_extracted", block_count=native["block_count"])
                return native

        # No native text (scanned/image PDF or non-PDF) — use PaddleOCR
        ocr = self._get_ocr()
        if ocr == "unavailable":
            log.warning("ocr.no_engine_available", mime_type=mime_type)
            return {
                "text": "",
                "blocks": [],
                "overall_confidence": 0.0,
                "requires_review": True,
                "block_count": 0,
                "extraction_method": "unavailable",
                "error": "PaddleOCR not installed and no native text in document. Manual review required.",
            }

        try:
            import numpy as np
            from PIL import Image

            if mime_type == "application/pdf":
                blocks = await self._rasterize_and_ocr(file_bytes, ocr)
            else:
                image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
                img_array = np.array(image)
                result = ocr.ocr(img_array, cls=True)
                blocks = self._parse_paddle_result(result)

            overall_confidence = sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0.0
            full_text = " ".join(b["text"] for b in blocks if b.get("text"))

            return {
                "text": full_text,
                "blocks": blocks,
                "overall_confidence": overall_confidence,
                "requires_review": overall_confidence < 0.7 or any(b["confidence"] < 0.5 for b in blocks),
                "block_count": len(blocks),
                "extraction_method": "paddleocr",
            }

        except Exception as exc:
            log.error("ocr.extraction_failed", error=str(exc))
            return {
                "text": "",
                "blocks": [],
                "overall_confidence": 0.0,
                "requires_review": True,
                "block_count": 0,
                "extraction_method": "error",
                "error": str(exc),
            }

    async def _extract_native_pdf_text(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """
        Extracts native text from a digital PDF using PyMuPDF.
        High confidence (0.95) for native text — no OCR needed.
        Returns empty blocks list if the PDF has no selectable text (scanned).
        """
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            blocks = []
            for page_num, page in enumerate(doc):
                text = page.get_text().strip()
                if text:
                    blocks.append({
                        "text": text,
                        "confidence": 0.95,
                        "page": page_num + 1,
                        "bbox": None,
                        "extraction_method": "native_pdf",
                    })
            doc.close()

            full_text = "\n".join(b["text"] for b in blocks)
            return {
                "text": full_text,
                "blocks": blocks,
                "overall_confidence": 0.95 if blocks else 0.0,
                "requires_review": False,
                "block_count": len(blocks),
                "extraction_method": "native_pdf",
            }
        except ImportError:
            log.warning("ocr.pymupdf_not_installed")
            return {"text": "", "blocks": [], "overall_confidence": 0.0, "requires_review": True, "block_count": 0}
        except Exception as exc:
            log.error("ocr.native_pdf_failed", error=str(exc))
            return {"text": "", "blocks": [], "overall_confidence": 0.0, "requires_review": True, "block_count": 0}

    async def _rasterize_and_ocr(self, pdf_bytes: bytes, ocr) -> List[Dict[str, Any]]:
        """Rasterize PDF pages and run PaddleOCR on each page image."""
        blocks = []
        try:
            import fitz
            import numpy as np

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page_num, page in enumerate(doc):
                pix = page.get_pixmap(dpi=200)
                img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
                result = ocr.ocr(img_array, cls=True)
                page_blocks = self._parse_paddle_result(result)
                for b in page_blocks:
                    b["page"] = page_num + 1
                blocks.extend(page_blocks)
            doc.close()
        except ImportError:
            log.warning("ocr.pymupdf_not_installed_for_rasterization")
        return blocks

    def _parse_paddle_result(self, result) -> List[Dict[str, Any]]:
        blocks = []
        if not result or not result[0]:
            return blocks
        for line in result[0]:
            if not line:
                continue
            bbox, (text, confidence) = line
            blocks.append({
                "text": text,
                "confidence": float(confidence),
                "bbox": bbox,
                "extraction_method": "paddleocr",
            })
        return blocks
