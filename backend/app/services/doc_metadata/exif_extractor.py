import fitz
import exifread
import os
from docx import Document
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def extract_pdf_metadata(file_path: str) -> dict:
    """Extracts metadata from PDF using PyMuPDF."""
    doc = fitz.open(file_path)
    meta = doc.metadata
    doc.close()
    return {
        "title": meta.get("title"),
        "author": meta.get("author"),
        "subject": meta.get("subject"),
        "creator": meta.get("creator"),
        "producer": meta.get("producer"),
        "creation_date": meta.get("creationDate"),
        "modification_date": meta.get("modDate"),
        "source": "pdf_metadata",
    }


def extract_docx_metadata(file_path: str) -> dict:
    """Extracts core properties from DOCX."""
    doc = Document(file_path)
    props = doc.core_properties
    return {
        "title": props.title,
        "author": props.author,
        "last_modified_by": props.last_modified_by,
        "created": props.created.isoformat() if props.created else None,
        "modified": props.modified.isoformat() if props.modified else None,
        "revision": props.revision,
        "source": "docx_core_properties",
    }


def extract_image_exif(file_path: str) -> dict:
    """Extracts EXIF data from image files using exifread."""
    result = {"source": "exif"}
    try:
        with open(file_path, "rb") as f:
            tags = exifread.process_file(
                f, stop_tag="GPS GPSLatitude", details=False
            )

        if tags.get("EXIF DateTimeOriginal"):
            result["capture_timestamp"] = str(tags["EXIF DateTimeOriginal"])
        if tags.get("Image Make"):
            result["device_make"] = str(tags["Image Make"])
        if tags.get("Image Model"):
            result["device_model"] = str(tags["Image Model"])
        if tags.get("Image Software"):
            result["software"] = str(tags["Image Software"])

        # GPS coordinates
        lat = tags.get("GPS GPSLatitude")
        lon = tags.get("GPS GPSLongitude")
        if lat and lon:
            result["gps_coords"] = {
                "latitude": str(lat),
                "longitude": str(lon),
            }
    except Exception as e:
        result["error"] = str(e)
    return result


def extract_file_system_metadata(file_path: str) -> dict:
    """Extracts OS-level file metadata."""
    stat = os.stat(file_path)
    return {
        "file_size_bytes": stat.st_size,
        "created_timestamp": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        "modified_timestamp": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def extract_metadata(file_path: str, mime_type: str) -> dict:
    """
    Routes to correct extractor and merges with filesystem metadata.
    Always returns a dict — never raises.
    """
    result = extract_file_system_metadata(file_path)
    try:
        if "pdf" in mime_type:
            result.update(extract_pdf_metadata(file_path))
        elif "wordprocessingml" in mime_type or "msword" in mime_type:
            result.update(extract_docx_metadata(file_path))
        elif "image" in mime_type:
            result.update(extract_image_exif(file_path))
    except Exception as e:
        result["metadata_error"] = str(e)
    return result
