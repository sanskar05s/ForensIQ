from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.core.supabase import get_supabase_client
from app.services.report.builder import generate_report, get_report_download_url

router = APIRouter()


@router.post("/report/cases/{case_id}/generate")
def trigger_report(case_id: str, background_tasks: BackgroundTasks):
    """
    Triggers PDF report generation.
    Runs synchronously (may take 20-40 seconds for full generation).
    For the academic demo this is acceptable.
    """
    supabase = get_supabase_client()

    # Verify case exists
    case = supabase.table("cases").select("id")\
        .eq("id", case_id).single().execute().data
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    try:
        storage_path = generate_report(case_id, supabase)
        return {
            "success": True,
            "message": "Report generated successfully",
            "storage_path": storage_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/cases/{case_id}")
def get_report(case_id: str):
    """Returns current report status and metadata."""
    supabase = get_supabase_client()
    result = supabase.table("reports").select("*")\
        .eq("case_id", case_id).maybe_single().execute()
    if not result or not result.data:
        return {"report": None, "message": "No report generated yet"}
    return {"report": result.data}


@router.get("/report/cases/{case_id}/download")
def download_report(case_id: str):
    """Returns a signed download URL for the report PDF (1 hour expiry)."""
    supabase = get_supabase_client()
    result = supabase.table("reports").select("storage_path, status")\
        .eq("case_id", case_id).maybe_single().execute().data

    if not result or result.get("status") != "ready":
        raise HTTPException(
            status_code=404,
            detail="Report not ready. Generate it first."
        )

    url = get_report_download_url(result["storage_path"], supabase)
    if not url:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate download link"
        )

    return {"url": url, "expires_in": 3600}
