"""Reusable Supabase authentication checks for backend Admin endpoints."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AuthorizedAdmin:
    user_id: str


class AdminAuthorizationError(Exception):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def extract_bearer_token(authorization_header: str | None) -> str:
    if not authorization_header:
        raise AdminAuthorizationError(
            "Authentication is required.",
            401,
        )

    scheme, separator, token = authorization_header.strip().partition(" ")

    if (
        not separator
        or scheme.lower() != "bearer"
        or not token.strip()
    ):
        raise AdminAuthorizationError(
            "A valid bearer token is required.",
            401,
        )

    return token.strip()


def authorize_active_admin(
    supabase_client,
    authorization_header: str | None,
) -> AuthorizedAdmin:
    token = extract_bearer_token(authorization_header)

    if supabase_client is None:
        raise AdminAuthorizationError(
            "Authentication service is unavailable.",
            503,
        )

    try:
        user_response = supabase_client.auth.get_user(token)
        user = getattr(user_response, "user", None)
        user_id = str(getattr(user, "id", "") or "")
    except Exception as error:
        raise AdminAuthorizationError(
            "The authentication token is invalid or expired.",
            401,
        ) from error

    if not user_id:
        raise AdminAuthorizationError(
            "The authentication token is invalid or expired.",
            401,
        )

    try:
        profile_response = (
            supabase_client.table("profiles")
            .select("id, role, status")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        profile = getattr(profile_response, "data", None)
    except Exception as error:
        raise AdminAuthorizationError(
            "Unable to verify the administrator profile.",
            503,
        ) from error

    if not isinstance(profile, dict):
        raise AdminAuthorizationError(
            "Administrator access is required.",
            403,
        )

    if profile.get("status") != "active":
        raise AdminAuthorizationError(
            "This account is not active.",
            403,
        )

    if profile.get("role") != "admin":
        raise AdminAuthorizationError(
            "Administrator access is required.",
            403,
        )

    return AuthorizedAdmin(user_id=user_id)
