from datetime import datetime

from flask import Blueprint, jsonify, request, session

from ..extensions import db
from ..models import User
from ..services.auth_helpers import get_current_user, login_required


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _json() -> dict:
    return request.get_json(silent=True) or {}


@auth_bp.post("/register")
def register():
    data = _json()
    required_fields = [
        "phone_number",
        "username",
        "password",
        "public_key",
        "encrypted_private_key",
        "key_encryption_salt",
    ]
    missing = [field for field in required_fields if not data.get(field)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    phone_number = data["phone_number"].strip()
    username = data["username"].strip()
    if User.query.filter_by(phone_number=phone_number).first():
        return jsonify({"error": "Phone number already exists."}), 409
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists."}), 409

    user = User(
        phone_number=phone_number,
        username=username,
        is_phone_verified=True,
        public_key=data["public_key"],
        encrypted_private_key=data["encrypted_private_key"],
        key_encryption_salt=data["key_encryption_salt"],
        is_online=False,
        last_seen=datetime.utcnow(),
    )
    user.set_password(data["password"])
    db.session.add(user)
    db.session.commit()
    return jsonify({"message": "Account created successfully."}), 201


@auth_bp.post("/login")
def login():
    data = _json()
    phone_number = (data.get("phone_number") or "").strip()
    password = data.get("password") or ""
    user = User.query.filter_by(phone_number=phone_number).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid phone number or password."}), 401

    session["user_id"] = user.id
    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Login successful.", "redirect_url": "/chat"})


@auth_bp.get("/session")
@login_required
def session_status():
    user = get_current_user()
    return jsonify(
        {
            "user": user.to_public_dict(),
            "encrypted_private_key": user.encrypted_private_key,
            "key_encryption_salt": user.key_encryption_salt,
        }
    )


@auth_bp.post("/logout")
@login_required
def logout():
    user = get_current_user()
    if user:
        user.is_online = False
        user.last_seen = datetime.utcnow()
        db.session.commit()
    session.clear()
    return jsonify({"message": "Logged out."})
