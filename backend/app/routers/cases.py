from fastapi import APIRouter

router = APIRouter(prefix="/cases", tags=["Cases"])


@router.get("/")
def list_cases():
    return {
        "success": True,
        "data": [],
    }


@router.get("/{case_id}")
def get_case(case_id: str):
    return {
        "success": True,
        "data": {
            "case_id": case_id,
        },
    }


@router.post("/")
def create_case():
    return {
        "success": True,
        "message": "Case endpoint placeholder for Milestone 0",
    }
