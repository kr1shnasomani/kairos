"""
OCR service — Layer 3: Multimodal Perception Engine.
Primary: NVIDIA NIM Nemotron-OCR-v2 (cloud API).
Fast path: PyMuPDF native text extraction for digital PDFs (no API call needed).
"""

import base64
import io
import structlog
from typing import Any, Dict, List, Optional

import httpx

log = structlog.get_logger(__name__)

_NIM_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_OCR_PROMPT = "Extract all text from this image exactly as it appears. Preserve layout and structure."


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
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{img_mime};base64,{b64}"}},
                        {"type": "text", "text": _OCR_PROMPT},
                    ],
                }
            ],
            "max_tokens": 4096,
            "temperature": 0.0,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    _NIM_CHAT_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()
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
                    pix = page.get_pixmap(dpi=150)
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
