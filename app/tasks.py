from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

from .extensions import db
from .models import ChatMessage, MediaAsset, UploadSession
from .services.storage_service import StorageError, get_storage


scheduler = BackgroundScheduler(timezone="UTC")


def purge_expired_data(app) -> None:
    with app.app_context():
        now = datetime.utcnow()
        expired_messages = ChatMessage.query.filter(ChatMessage.expires_at <= now).all()
        media_ids = {message.media_id for message in expired_messages if message.media_id}

        for message in expired_messages:
            db.session.delete(message)
        db.session.commit()

        expired_assets = MediaAsset.query.filter(MediaAsset.expires_at <= now).all()
        if media_ids:
            expired_assets.extend(
                MediaAsset.query.filter(MediaAsset.id.in_(media_ids)).all()
            )

        unique_assets = {asset.id: asset for asset in expired_assets}.values()
        storage = get_storage()
        for asset in unique_assets:
            try:
                storage.delete_file(asset)
            except StorageError:
                pass
            db.session.delete(asset)
        db.session.commit()


def purge_stale_uploads(app) -> None:
    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(hours=app.config["STALE_UPLOAD_TTL_HOURS"])
        stale_uploads = UploadSession.query.filter(
            UploadSession.updated_at <= cutoff, UploadSession.status != "completed"
        ).all()
        for upload in stale_uploads:
            Path(upload.tmp_path).unlink(missing_ok=True)
            db.session.delete(upload)
        db.session.commit()


def configure_scheduler(app) -> None:
    if not app.config.get("ENABLE_SCHEDULER") or scheduler.running:
        return

    scheduler.add_job(
        func=purge_expired_data,
        args=[app],
        trigger="interval",
        minutes=10,
        id="purge-expired-data",
        replace_existing=True,
    )
    scheduler.add_job(
        func=purge_stale_uploads,
        args=[app],
        trigger="interval",
        minutes=30,
        id="purge-stale-uploads",
        replace_existing=True,
    )
    scheduler.start()
