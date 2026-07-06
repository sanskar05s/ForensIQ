import hashlib
from pathlib import Path


CHUNK_SIZE = 1024 * 1024  # 1 MB


def hash_file(file_path: str | Path) -> str:
    """
    Computes SHA-256 hash of a file.
    """

    file_path = Path(file_path)

    sha = hashlib.sha256()

    with open(file_path, "rb") as f:
        while chunk := f.read(CHUNK_SIZE):
            sha.update(chunk)

    return sha.hexdigest()
