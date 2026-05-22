from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from flask import url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow() -> datetime:
    return datetime.utcnow()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(32), unique=True, nullable=False, index=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.LargeBinary, nullable=False)
    is_phone_verified = db.Column(db.Boolean, default=False, nullable=False)
    public_key = db.Column(db.Text, nullable=False)
    encrypted_private_key = db.Column(db.Text, nullable=False)
    key_encryption_salt = db.Column(db.String(255), nullable=False)
    is_online = db.Column(db.Boolean, default=False, nullable=False)
    last_seen = db.Column(db.DateTime, default=utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password).encode("utf-8")

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash.decode("utf-8"), raw_password)

    def to_public_dict(self) -> dict:
        return {
            "id": self.id,
            "phone_number": self.phone_number,
            "username": self.username,
            "public_key": self.public_key,
            "is_online": self.is_online,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
        }


class AppNotification(db.Model):
    __tablename__ = "app_notifications"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    kind = db.Column(db.String(32), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    resource_type = db.Column(db.String(32))
    resource_id = db.Column(db.String(64))
    is_read = db.Column(db.Boolean, default=False, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    recipient = db.relationship("User", foreign_keys=[recipient_id], lazy="joined")
    actor = db.relationship("User", foreign_keys=[actor_id], lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "body": self.body,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat(),
            "actor": self.actor.to_public_dict() if self.actor else None,
        }


class Friendship(db.Model):
    __tablename__ = "friendships"

    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    addressee_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String(16), default="pending", nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    responded_at = db.Column(db.DateTime)

    requester = db.relationship("User", foreign_keys=[requester_id], lazy="joined")
    addressee = db.relationship("User", foreign_keys=[addressee_id], lazy="joined")

    __table_args__ = (
        db.UniqueConstraint("requester_id", "addressee_id", name="uq_friendship_direction"),
    )

    def counterpart(self, user_id: int) -> User:
        return self.addressee if self.requester_id == user_id else self.requester

    def to_dict_for(self, user_id: int) -> dict:
        friend = self.counterpart(user_id)
        return {
            "id": self.id,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "responded_at": self.responded_at.isoformat() if self.responded_at else None,
            "friend": friend.to_public_dict(),
            "direction": "outgoing" if self.requester_id == user_id else "incoming",
        }


class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    name = db.Column(db.String(120), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    creator = db.relationship("User", lazy="joined")

    def to_dict(self, members: list["GroupMembership"] | None = None) -> dict:
        payload = {
            "id": self.id,
            "name": self.name,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if members is not None:
            payload["members"] = [member.to_dict() for member in members]
        return payload


class GroupMembership(db.Model):
    __tablename__ = "group_memberships"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.String(36), db.ForeignKey("groups.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    role = db.Column(db.String(16), default="member", nullable=False)
    joined_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    group = db.relationship("Group", lazy="joined")
    user = db.relationship("User", lazy="joined")

    __table_args__ = (
        db.UniqueConstraint("group_id", "user_id", name="uq_group_membership"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "role": self.role,
            "joined_at": self.joined_at.isoformat(),
            "user": self.user.to_public_dict(),
        }


class UploadSession(db.Model):
    __tablename__ = "upload_sessions"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    original_filename = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(255), nullable=False)
    media_type = db.Column(db.String(16), nullable=False)
    total_size = db.Column(db.BigInteger, nullable=False)
    chunk_size = db.Column(db.Integer, nullable=False)
    received_bytes = db.Column(db.BigInteger, default=0, nullable=False)
    tmp_path = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(16), default="initiated", nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = db.relationship("User", lazy="joined")


class MediaAsset(db.Model):
    __tablename__ = "media_assets"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    storage_provider = db.Column(db.String(32), nullable=False)
    storage_key = db.Column(db.Text, nullable=False)
    storage_url = db.Column(db.Text, nullable=False)
    local_path = db.Column(db.Text)
    file_name = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(255), nullable=False)
    size_bytes = db.Column(db.BigInteger, nullable=False)
    media_type = db.Column(db.String(16), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)

    owner = db.relationship("User", lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "file_name": self.file_name,
            "content_type": self.content_type,
            "size_bytes": self.size_bytes,
            "media_type": self.media_type,
            "download_url": url_for("media.download_media", media_id=self.id),
            "preview_url": url_for("media.download_media", media_id=self.id),
        }


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    kind = db.Column(db.String(16), default="text", nullable=False)
    sender_payload = db.Column(db.Text)
    recipient_payload = db.Column(db.Text)
    media_id = db.Column(db.String(36), db.ForeignKey("media_assets.id"), index=True)
    is_seen = db.Column(db.Boolean, default=False, nullable=False, index=True)
    seen_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)

    sender = db.relationship("User", foreign_keys=[sender_id], lazy="joined")
    recipient = db.relationship("User", foreign_keys=[recipient_id], lazy="joined")
    media = db.relationship("MediaAsset", lazy="joined")

    def to_dict_for(self, viewer_id: int) -> dict:
        payload = self.sender_payload if viewer_id == self.sender_id else self.recipient_payload
        counterpart = self.recipient if viewer_id == self.sender_id else self.sender
        return {
            "id": self.id,
            "kind": self.kind,
            "payload": payload,
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "counterpart_id": counterpart.id,
            "is_seen": self.is_seen,
            "seen_at": self.seen_at.isoformat() if self.seen_at else None,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "media": self.media.to_dict() if self.media else None,
        }


class GroupMessage(db.Model):
    __tablename__ = "group_messages"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    group_id = db.Column(db.String(36), db.ForeignKey("groups.id"), nullable=False, index=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    kind = db.Column(db.String(16), default="text", nullable=False)
    payload = db.Column(db.Text)
    media_id = db.Column(db.String(36), db.ForeignKey("media_assets.id"), index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)

    group = db.relationship("Group", lazy="joined")
    sender = db.relationship("User", foreign_keys=[sender_id], lazy="joined")
    media = db.relationship("MediaAsset", lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "group_id": self.group_id,
            "kind": self.kind,
            "payload": self.payload,
            "sender": self.sender.to_public_dict(),
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "media": self.media.to_dict() if self.media else None,
        }


class ScreenshotEvent(db.Model):
    __tablename__ = "screenshot_events"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    reporter_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    target_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    conversation_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    reason = db.Column(db.String(32), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    reporter = db.relationship("User", foreign_keys=[reporter_id], lazy="joined")
    target_user = db.relationship("User", foreign_keys=[target_user_id], lazy="joined")
