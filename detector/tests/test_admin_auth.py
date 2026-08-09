from __future__ import annotations

import unittest
from types import SimpleNamespace

from detector.admin_auth import (
    AdminAuthorizationError,
    authorize_active_admin,
)


class FakeProfileQuery:
    def __init__(self, profile):
        self.profile = profile

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self.profile)


class FakeSupabaseClient:
    def __init__(
        self,
        *,
        role="admin",
        status="active",
        token_valid=True,
    ):
        self.profile = {
            "id": "user-1",
            "role": role,
            "status": status,
        }
        self.token_valid = token_valid
        self.auth = self

    def get_user(self, token):
        if not self.token_valid or token != "valid-token":
            raise RuntimeError("invalid token")

        return SimpleNamespace(
            user=SimpleNamespace(id="user-1")
        )

    def table(self, table_name):
        if table_name != "profiles":
            raise AssertionError("Unexpected table")

        return FakeProfileQuery(self.profile)


class AdminAuthorizationTests(unittest.TestCase):
    def test_active_admin_is_accepted(self):
        authorized = authorize_active_admin(
            FakeSupabaseClient(),
            "Bearer valid-token",
        )

        self.assertEqual(authorized.user_id, "user-1")

    def test_missing_token_is_rejected_with_401(self):
        with self.assertRaises(AdminAuthorizationError) as context:
            authorize_active_admin(FakeSupabaseClient(), None)

        self.assertEqual(context.exception.status_code, 401)

    def test_invalid_token_is_rejected_with_401(self):
        with self.assertRaises(AdminAuthorizationError) as context:
            authorize_active_admin(
                FakeSupabaseClient(token_valid=False),
                "Bearer expired-token",
            )

        self.assertEqual(context.exception.status_code, 401)

    def test_officer_is_rejected_with_403(self):
        self.assert_role_rejected("barangay_officer")

    def test_responder_is_rejected_with_403(self):
        self.assert_role_rejected("disaster_responder")

    def test_resident_is_rejected_with_403(self):
        self.assert_role_rejected("resident")

    def test_inactive_admin_is_rejected_with_403(self):
        with self.assertRaises(AdminAuthorizationError) as context:
            authorize_active_admin(
                FakeSupabaseClient(status="inactive"),
                "Bearer valid-token",
            )

        self.assertEqual(context.exception.status_code, 403)

    def assert_role_rejected(self, role):
        with self.assertRaises(AdminAuthorizationError) as context:
            authorize_active_admin(
                FakeSupabaseClient(role=role),
                "Bearer valid-token",
            )

        self.assertEqual(context.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
