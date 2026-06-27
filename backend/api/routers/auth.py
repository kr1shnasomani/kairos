"""
Auth router — Supabase Auth JWT exchange and user profile.
"""

import asyncio

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from supabase import create_client

from api.dependencies import CurrentUserDep, SettingsDep, SupabaseDep

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str


@router.post("/login", response_model=TokenResponse, summary="Exchange credentials for JWT")
async def login(payload: LoginRequest, settings: SettingsDep) -> TokenResponse:
    # Use a fresh anon client for sign-in to avoid contaminating the global service-role client session
    auth_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    try:
        result = await asyncio.to_thread(
            lambda: auth_client.auth.sign_in_with_password(
                {"email": payload.email, "password": payload.password}
            )
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    if not result.session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        user_id=str(result.user.id),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Refresh an expired JWT")
async def refresh(payload: RefreshRequest, settings: SettingsDep) -> TokenResponse:
    auth_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    try:
        result = await asyncio.to_thread(
            lambda: auth_client.auth.refresh_session(payload.refresh_token)
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    if not result.session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return TokenResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        user_id=str(result.user.id),
    )


@router.get("/me", summary="Get current user profile from JWT claims")
async def get_me(current_user: CurrentUserDep) -> dict:
    return current_user
