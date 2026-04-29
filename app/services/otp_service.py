from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from flask import current_app

try:
    from twilio.rest import Client
except ImportError:  # pragma: no cover
    Client = None


class OTPService:
    def __init__(self) -> None:
        self._cache: dict[str, dict] = {}

    def _client(self):
        sid = current_app.config.get("TWILIO_ACCOUNT_SID")
        token = current_app.config.get("TWILIO_AUTH_TOKEN")
        if sid and token and Client:
            return Client(sid, token)
        return None

    def send_code(self, phone_number: str) -> dict:
        verify_service_sid = current_app.config.get("TWILIO_VERIFY_SERVICE_SID")
        client = self._client()
        if client and verify_service_sid:
            client.verify.v2.services(verify_service_sid).verifications.create(
                to=phone_number, channel="sms"
            )
            return {"provider": "twilio"}

        code = f"{secrets.randbelow(900000) + 100000}"
        expires_at = datetime.utcnow() + timedelta(
            minutes=current_app.config["OTP_TTL_MINUTES"]
        )
        self._cache[phone_number] = {"code": code, "expires_at": expires_at}
        return {"provider": "debug", "code": code}

    def verify_code(self, phone_number: str, code: str) -> bool:
        verify_service_sid = current_app.config.get("TWILIO_VERIFY_SERVICE_SID")
        client = self._client()
        if client and verify_service_sid:
            result = (
                client.verify.v2.services(verify_service_sid)
                .verification_checks.create(to=phone_number, code=code)
            )
            return result.status == "approved"

        cached = self._cache.get(phone_number)
        if not cached:
            return False
        if cached["expires_at"] < datetime.utcnow():
            self._cache.pop(phone_number, None)
            return False
        is_valid = secrets.compare_digest(cached["code"], code)
        if is_valid:
            self._cache.pop(phone_number, None)
        return is_valid


otp_service = OTPService()
