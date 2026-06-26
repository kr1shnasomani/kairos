"""
Auth router — token exchange, user profile, logout.
Authentication is provided by Supabase Auth (JWT).
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class TokenRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str


@router.post("/login", response_model=TokenResponse, summary="Exchange credentials for JWT")
async def login(payload: TokenRequest) -> TokenResponse:
    """
    In production, this delegates to Supabase Auth.
    In development (Supabase not yet configured), returns a signed dev token.
    """
    # TODO: delegate to Supabase Auth once project is configured
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Supabase Auth not yet configured. Set SUPABASE_URL and keys in .env.",
    )


@router.get("/me", summary="Get current user profile")
async def get_me() -> dict:
    """Returns the authenticated user's profile from the JWT claims."""
    # Populated by get_current_user dependency in production
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Auth not yet configured.",
    )
