from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.blockchain.sepolia_writer import write_hash_to_sepolia

router = APIRouter(
    prefix="/blockchain",
    tags=["Blockchain"]
)


class BlockchainRequest(BaseModel):
    sha256: str
    evidence_id: str


@router.post("/write")
def write_hash(request: BlockchainRequest):
    """
    M1-C Blockchain Endpoint

    Writes a SHA-256 hash to the Sepolia blockchain.
    """

    try:
        result = write_hash_to_sepolia(
            request.sha256,
            request.evidence_id
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
