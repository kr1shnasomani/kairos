"""
OCR service — Layer 3: Multimodal Perception Engine.
Primary: NVIDIA NIM Nemotron-OCR-v2 via the CV API (https://ai.api.nvidia.com/v1/cv/<model>).
Fast path: plain text and native digital PDFs need no API call.

NOTE: The OCR model uses a DIFFERENT base URL and request format than the chat/LLM models.
- LLM/NER: https://integrate.api.nvidia.com/v1/chat/completions  (OpenAI-compatible)
- OCR/CV:  https://ai.api.nvidia.com/v1/cv/<model-name>           (CV API)
"""

import base64
import structlog
from typing import Any, Dict, List, Optional

import httpx

log = structlog.get_logger(__name__)

# CV API — model name is part of the URL path, not the payload
_NIM_CV_BASE = "https://ai.api.nvidia.com/v1/cv"
_NIM_IMAGE_SIZE_LIMIT = 180_000  # base64 chars; larger images need the assets API


class OCRService:
    def __init__(self):
        import os
        self.api_key = os.getenv("NVIDIA_NIM_API_KEY", "")
        self.model = os.getenv("NVIDIA_NIM_OCR_MODEL", "nvidia/nemotron-ocr-v2")

    async def extract_text(
        self,
        file_bytes: bytes,
        mime_type: str = "application/pdf",
        language_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Fast path: plain text files — decode directly, no API cost
        if mime_type in ("text/plain", "text/markdown", "text/csv"):
            text = file_bytes.decode("utf-8", errors="replace").strip()
            if text:
                return {
                    "text": text,
                    "blocks": [{"text": text, "confidence": 1.0, "page": 1, "extraction_method": "native_text"}],
                    "overall_confidence": 1.0,
                    "requires_review": False,
                    "block_count": 1,
                    "extraction_method": "native_text",
                }

        # Fast path: native text from digital PDFs — no API cost
        if mime_type == "application/pdf":
            native = self._extract_native_pdf(file_bytes)
            if native["blocks"]:
                return native

        # Scanned/image document — rasterize and send to NIM
        images = self._to_images(file_bytes, mime_type)
        if not images:
            return self._empty("could_not_rasterize")

        blocks = []
        for page_num, (img_bytes, img_mime) in enumerate(images):
            page_text = await self._nim_ocr(img_bytes, img_mime)
            if page_text:
                blocks.append({
                    "text": page_text,
                    "confidence": 0.95,
                    "page": page_num + 1,
                    "extraction_method": "nim_ocr",
                })

        if not blocks:
            return self._empty("nim_returned_no_text")

        full_text = "\n".join(b["text"] for b in blocks)
        return {
            "text": full_text,
            "blocks": blocks,
            "overall_confidence": 0.95,
            "requires_review": False,
            "block_count": len(blocks),
            "extraction_method": "nim_ocr",
        }

    async def _nim_ocr(self, img_bytes: bytes, img_mime: str) -> str:
        if not self.api_key:
            log.error("ocr.no_nim_key", hint="Set NVIDIA_NIM_API_KEY in .env")
            return ""

        b64 = base64.b64encode(img_bytes).decode()
        if len(b64) > _NIM_IMAGE_SIZE_LIMIT:
            log.warning("ocr.image_too_large", b64_len=len(b64), limit=_NIM_IMAGE_SIZE_LIMIT,
                        hint="Use assets API for images >180KB base64")
            return ""

        # CV API: model name in URL, "input" array (not chat messages format)
        url = f"{_NIM_CV_BASE}/{self.model}"
        payload = {
            "input": [
                {"type": "image_url", "url": f"data:{img_mime};base64,{b64}"}
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                body = resp.json()
                # CV API response: {"data": [{"index": 0, "text_detections": [...]}]}
                # Each detection has a "label" field with the detected text
                detections = body.get("data", [{}])[0].get("text_detections", [])
                if not detections:
                    log.info("ocr.no_detections", model=self.model)
                    return ""
                lines = [d.get("label") or d.get("text") or "" for d in detections]
                return "\n".join(line for line in lines if line).strip()
        except httpx.HTTPStatusError as exc:
            log.error("ocr.nim_error", status=exc.response.status_code, body=exc.response.text[:200])
            return ""
        except Exception as exc:
            log.error("ocr.nim_failed", error=str(exc))
            return ""

    def _extract_native_pdf(self, pdf_bytes: bytes) -> Dict[str, Any]:
        try:
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            blocks = []
            for page_num, page in enumerate(doc):
                text = page.get_text().strip()
                if text:
                    blocks.append({
                        "text": text,
                        "confidence": 0.95,
                        "page": page_num + 1,
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
        except Exception as exc:
            log.error("ocr.native_pdf_failed", error=str(exc))
            return {"text": "", "blocks": [], "overall_confidence": 0.0,
                    "requires_review": True, "block_count": 0, "extraction_method": "error"}

    def _to_images(self, file_bytes: bytes, mime_type: str) -> List[tuple]:
        """Returns list of (image_bytes, mime) — one per page for PDFs, one for images."""
        if mime_type == "application/pdf":
            try:
                import fitz
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                pages = []
                for page in doc:
                    # 96 DPI keeps base64 under the 180KB CV API inline limit for typical A4
                    pix = page.get_pixmap(dpi=96)
                    pages.append((pix.tobytes("png"), "image/png"))
                doc.close()
                return pages
            except Exception as exc:
                log.error("ocr.rasterize_failed", error=str(exc))
                return []
        else:
            return [(file_bytes, mime_type)]

    @staticmethod
    def _empty(reason: str) -> Dict[str, Any]:
        return {
            "text": "",
            "blocks": [],
            "overall_confidence": 0.0,
            "requires_review": True,
            "block_count": 0,
            "extraction_method": "error",
            "error": reason,
        }
