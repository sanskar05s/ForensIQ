"""Authentication and case ownership dependencies for the ForensIQ API."""

import logging

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.supabase import get_supabase_client


logger = logging.getLogger(__name__)
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> str:
    """Validate the supplied access token with Supabase Auth and return its user ID."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        response = get_supabase_client().auth.get_user(credentials.credentials)
        user = response.user if response else None
    except Exception as exc:
        # AuthApiError exposes the HTTP response status. Treat rejected tokens as
        # 401, but do not turn an Auth service/network outage into a false 401.
        response_status = getattr(exc, "status", None) or getattr(
            exc, "status_code", None
        )
        if response_status in (400, 401, 403):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from None

        logger.warning(
            "Supabase access-token verification unavailable (%s)",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable.",
        ) from None

    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return str(user_id)


def assert_case_owner(case_id: str, user_id: str) -> None:
    """Require that the authenticated user owns the requested case."""
    try:
        result = (
            get_supabase_client()
            .table("cases")
            .select("id")
            .eq("id", case_id)
            .eq("created_by", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        logger.warning("Case ownership lookup unavailable (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Case access could not be verified. Please try again.",
        ) from None

    if not result.data:
        # Return the same response for missing and non-owned IDs to avoid
        # disclosing whether another user's case exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")


def require_case_owner(
    case_id: str,
    user_id: str = Depends(get_current_user_id),
) -> str:
    """FastAPI dependency for routes whose path contains ``case_id``."""
    assert_case_owner(case_id, user_id)
    return user_id
