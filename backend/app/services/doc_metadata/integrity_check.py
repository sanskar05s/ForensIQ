import fitz
import os
from docx import Document
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

EDITING_SOFTWARE_KEYWORDS = [
    "photoshop",
    "gimp",
    "acrobat",
    "foxit",
    "preview",
    "libreoffice",
    "openoffice",
    "paint",
    "inkscape",
]


def check_integrity(file_path: str, mime_type: str) -> dict:
    """
    Performs integrity checks on the uploaded document.
    Does NOT verify the blockchain hash — that is Module 6's job.
    This checks for metadata-level signs of modification.

    Returns:
    {
        flagged: bool,
        note: str,
        checks_performed: [list of check names run]
    }
    """
    flags = []
    checks = []

    try:
        stat = os.stat(file_path)
        ctime = datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc)
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        checks.append("filesystem_timestamps")

        diff_seconds = abs((mtime - ctime).total_seconds())
        if diff_seconds > 120:
            flags.append(
                f"File modification time is {int(diff_seconds)} seconds "
                f"after creation time. Possible post-creation edit."
            )

        if "pdf" in mime_type:
            checks.append("pdf_metadata_dates")
            doc = fitz.open(file_path)
            meta = doc.metadata
            doc.close()

            creation = meta.get("creationDate", "")
            modification = meta.get("modDate", "")

            if modification and creation and modification != creation:
                flags.append(
                    f"PDF modification date differs from creation date. "
                    f"Document may have been edited after original creation."
                )

            producer = (meta.get("producer") or "").lower()
            creator = (meta.get("creator") or "").lower()
            for keyword in EDITING_SOFTWARE_KEYWORDS:
                if keyword in producer or keyword in creator:
                    flags.append(
                        f"Document produced or modified by editing software: "
                        f"'{meta.get('producer') or meta.get('creator')}'"
                    )
                    break

        elif "wordprocessingml" in mime_type or "msword" in mime_type:
            checks.append("docx_core_properties")
            d = Document(file_path)
            props = d.core_properties
            if props.created and props.modified:
                if props.modified > props.created:
                    diff = (props.modified - props.created).total_seconds()
                    if diff > 120:
                        flags.append(
                            f"DOCX modified date is {int(diff)} seconds after "
                            f"creation date. Document was edited after creation."
                        )
            if props.revision and int(props.revision or 0) > 1:
                flags.append(
                    f"Document has been revised {props.revision} time(s)."
                )

    except Exception as e:
        logger.warning(f"Integrity check failed for {file_path}: {e}")
        return {
            "flagged": False,
            "note": f"Integrity check could not be completed: {str(e)}",
            "checks_performed": checks,
        }

    flagged = len(flags) > 0
    note = " | ".join(flags) if flags else "No integrity issues detected."

    return {
        "flagged": flagged,
        "note": note,
        "checks_performed": checks,
    }
