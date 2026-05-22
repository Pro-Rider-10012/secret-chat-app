from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, Response, current_app, jsonify, request
from werkzeug.utils import secure_filename

from ..extensions import db
from ..models import ChatMessage, GroupMembership, GroupMessage, MediaAsset, UploadSession
from ..services.auth_helpers import get_current_user, login_required
from ..services.storage_service import StorageError, get_storage


media_bp = Blueprint("media", __name__, url_prefix="/api/media")


def _asset_payload(asset: MediaAsset) -> dict:
    return asset.to_dict()


def _can_access_asset(user_id: int, asset_id: str) -> bool:
    if MediaAsset.query.filter_by(id=asset_id, owner_id=user_id).first():
        return True
    message = ChatMessage.query.filter_by(media_id=asset_id).filter(
        (ChatMessage.sender_id == user_id) | (ChatMessage.recipient_id == user_id)
    ).first()
    if message:
        return True
    group_message = (
        GroupMessage.query.filter_by(media_id=asset_id)
        .join(GroupMembership, GroupMembership.group_id == GroupMessage.group_id)
        .filter(GroupMembership.user_id == user_id)
        .first()
    )
    return bool(group_message)


@media_bp.post("/upload-sessions")
@login_required
def create_upload_session():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    filename = secure_filename((data.get("filename") or "").strip())
    content_type = (data.get("content_type") or "").strip()
    media_type = (data.get("media_type") or "").strip()
    total_size = int(data.get("total_size") or 0)
    chunk_size = int(data.get("chunk_size") or current_app.config["MAX_CHUNK_SIZE"])

    if not filename or not content_type or media_type not in {"image", "video", "audio"}:
        return jsonify({"error": "Invalid media metadata."}), 400
    if total_size <= 0:
        return jsonify({"error": "Total file size must be greater than zero."}), 400
    if chunk_size > current_app.config["MAX_CHUNK_SIZE"]:
        return jsonify({"error": "Chunk size exceeds server limit."}), 400

    tmp_name = f"{uuid4()}-{filename}.part"
    tmp_path = Path(current_app.config["UPLOAD_TMP_DIR"]) / tmp_name
    tmp_path.touch()

    upload = UploadSession(
        user_id=user.id,
        original_filename=filename,
        content_type=content_type,
        media_type=media_type,
        total_size=total_size,
        chunk_size=chunk_size,
        tmp_path=str(tmp_path),
        status="uploading",
    )
    db.session.add(upload)
    db.session.commit()
    return jsonify(
        {
            "upload_id": upload.id,
            "chunk_size": upload.chunk_size,
            "message": "Upload session created.",
        }
    )


@media_bp.put("/upload-sessions/<upload_id>/chunk")
@login_required
def upload_chunk(upload_id: str):
    user = get_current_user()
    upload = UploadSession.query.get_or_404(upload_id)
    if upload.user_id != user.id or upload.status not in {"initiated", "uploading"}:
        return jsonify({"error": "Upload session is not available."}), 403

    offset = int(request.args.get("offset", "-1"))
    if offset != upload.received_bytes:
        return jsonify(
            {
                "error": "Chunk offset mismatch.",
                "expected_offset": upload.received_bytes,
            }
        ), 409

    chunk = request.get_data()
    if not chunk:
        return jsonify({"error": "Chunk payload is empty."}), 400

    tmp_path = Path(upload.tmp_path)
    with tmp_path.open("ab") as handle:
        handle.write(chunk)

    upload.received_bytes += len(chunk)
    upload.status = "uploading"
    db.session.commit()
    return jsonify({"received_bytes": upload.received_bytes, "complete": False})


@media_bp.post("/upload-sessions/<upload_id>/complete")
@login_required
def complete_upload(upload_id: str):
    user = get_current_user()
    upload = UploadSession.query.get_or_404(upload_id)
    if upload.user_id != user.id:
        return jsonify({"error": "Upload session does not belong to you."}), 403
    if upload.received_bytes != upload.total_size:
        return jsonify({"error": "Upload is incomplete."}), 400

    tmp_path = Path(upload.tmp_path)
    storage = get_storage()
    try:
        stored = storage.save_uploaded_file(tmp_path, upload.original_filename, upload.content_type)
    except StorageError as exc:
        return jsonify({"error": str(exc)}), 502

    asset = MediaAsset(
        owner_id=user.id,
        storage_provider=stored["provider"],
        storage_key=stored["storage_key"],
        storage_url=stored["storage_url"],
        local_path=stored.get("local_path"),
        file_name=upload.original_filename,
        content_type=upload.content_type,
        size_bytes=upload.total_size,
        media_type=upload.media_type,
        expires_at=datetime.utcnow() + timedelta(hours=current_app.config["MESSAGE_TTL_HOURS"]),
    )
    db.session.add(asset)
    upload.status = "completed"
    db.session.commit()
    tmp_path.unlink(missing_ok=True)
    return jsonify({"media": _asset_payload(asset)})


@media_bp.get("/<media_id>/download")
@login_required
def download_media(media_id: str):
    user = get_current_user()
    asset = MediaAsset.query.get_or_404(media_id)
    if not _can_access_asset(user.id, asset.id):
        return jsonify({"error": "You are not allowed to access this file."}), 403

    storage = get_storage()
    try:
        stream, content_length = storage.open_file(asset)
    except StorageError as exc:
        return jsonify({"error": str(exc)}), 502

    as_attachment = request.args.get("download") == "1"
    headers = {
        "Content-Length": str(content_length),
        "Content-Disposition": (
            f'attachment; filename="{asset.file_name}"'
            if as_attachment
            else f'inline; filename="{asset.file_name}"'
        ),
    }
    return Response(stream, mimetype=asset.content_type, headers=headers)
