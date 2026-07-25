"""
OCR service — Layer 3: Multimodal Perception Engine.
Primary: NVIDIA NIM Nemotron-OCR-v2 via the CV API (https://ai.api.nvidia.com/v1/cv/<model>).
Fast path: plain text and native digital PDFs need no API call.

NOTE: The OCR model uses a DIFFERENT base URL and request format than the chat/LLM models.
- LLM/NER: https://integrate.api.nvidia.com/v1/chat/completions  (OpenAI-compatible)
- OCR/CV:  https://ai.api.nvidia.com/v1/cv/<model-name>           (CV API)
"""

import base64
import io
import structlog
from typing import Any, Dict, List, Optional

import httpx

from api.services.http import shared_client

log = structlog.get_logger(__name__)

# CV API — model name is part of the URL path, not the payload
_NIM_CV_BASE = "https://ai.api.nvidia.com/v1/cv"
_NIM_IMAGE_SIZE_LIMIT = 180_000  # base64 chars; larger images need the assets API

_TEXT_MIMES = ("text/plain", "text/markdown", "text/csv")

# Spreadsheets: work-order exports, asset registries, inspection logs.
_SPREADSHEET_MIMES = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",                                          # .xls (xlsx-era files often mislabelled)
    "application/vnd.oasis.opendocument.spreadsheet",                    # .ods
)

# Email archives: the "scattered across email" corpus in the problem statement.
_EMAIL_MIMES = ("message/rfc822", "application/mbox", "text/rfc822-headers")

# Headers worth keeping — they carry the personnel/date entities NER looks for.
_EMAIL_HEADERS = ("Date", "From", "To", "Cc", "Subject")


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
        if mime_type in _TEXT_MIMES:
            text = file_bytes.decode("utf-8", errors="replace").strip()
            if text:
                return self._native(text, "native_text")

        # Fast path: spreadsheets — structured cells, never an OCR problem
        if mime_type in _SPREADSHEET_MIMES:
            text = self._extract_spreadsheet(file_bytes)
            if text:
                return self._native(text, "spreadsheet")
            return self._empty("spreadsheet_unreadable")

        # Fast path: email archives (.eml / .mbox) — stdlib parsing, no API cost
        if mime_type in _EMAIL_MIMES:
            text = self._extract_email(file_bytes)
            if text:
                return self._native(text, "email")
            return self._empty("email_unreadable")

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
            client = shared_client(60.0)
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60.0,
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

    def _native(self, text: str, method: str) -> Dict[str, Any]:
        """Result envelope for extraction paths that need no OCR model."""
        return {
            "text": text,
            "blocks": [{"text": text, "confidence": 1.0, "page": 1, "extraction_method": method}],
            "overall_confidence": 1.0,
            "requires_review": False,
            "block_count": 1,
            "extraction_method": method,
        }

    @staticmethod
    def _extract_spreadsheet(file_bytes: bytes) -> str:
        """
        Flattens every sheet to tab-separated rows, prefixed by sheet name.

        openpyxl rather than hand-rolling zip+XML: xlsx cell typing (dates stored as
        serial numbers, shared vs inline strings) is exactly the kind of silent
        corruption that must not reach the knowledge graph. read_only streams rows
        instead of loading the whole workbook.
        """
        try:
            import openpyxl

            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        except Exception as exc:
            log.warning("ocr.spreadsheet_open_failed", error=str(exc))
            return ""

        lines: List[str] = []
        try:
            for sheet in wb.worksheets:
                rows = [
                    "\t".join("" if c is None else str(c) for c in row)
                    for row in sheet.iter_rows(values_only=True)
                ]
                rows = [r for r in rows if r.strip()]
                if rows:
                    lines.append(f"# Sheet: {sheet.title}")
                    lines.extend(rows)
        except Exception as exc:
            log.warning("ocr.spreadsheet_read_failed", error=str(exc))
        finally:
            wb.close()

        return "\n".join(lines).strip()

    @staticmethod
    def _extract_email(file_bytes: bytes) -> str:
        """
        Extracts headers + plaintext bodies from a .eml or .mbox archive.

        stdlib `email` only — no dependency needed. An mbox is concatenated messages
        separated by a line starting "From "; splitting on that is the format's own
        delimiter. Attachments are listed by filename, not decoded: their bytes belong
        in the vault as their own documents, not inlined into this one's text.
        """
        from email import message_from_bytes
        from email.message import Message

        raw = file_bytes.lstrip()
        # mbox: split on the "From " line that opens each message.
        chunks = [c for c in raw.split(b"\nFrom ") if c.strip()] if raw.startswith(b"From ") else [raw]

        def render(msg: Message) -> str:
            parts: List[str] = []
            for header in _EMAIL_HEADERS:
                value = msg.get(header)
                if value:
                    parts.append(f"{header}: {value}")

            attachments: List[str] = []
            for part in msg.walk() if msg.is_multipart() else [msg]:
                disposition = str(part.get("Content-Disposition") or "")
                if "attachment" in disposition:
                    name = part.get_filename()
                    if name:
                        attachments.append(name)
                    continue
                if part.get_content_type() == "text/plain":
                    try:
                        payload = part.get_payload(decode=True) or b""
                        body = payload.decode(part.get_content_charset() or "utf-8", errors="replace").strip()
                    except Exception:
                        continue
                    if body:
                        parts.append("")
                        parts.append(body)

            if attachments:
                parts.append(f"\n[Attachments: {', '.join(attachments)}]")
            return "\n".join(parts).strip()

        rendered = []
        for i, chunk in enumerate(chunks):
            try:
                rendered.append(render(message_from_bytes(chunk if i == 0 else b"From " + chunk)))
            except Exception as exc:
                log.warning("ocr.email_parse_failed", index=i, error=str(exc))

        return "\n\n---\n\n".join(r for r in rendered if r).strip()

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
