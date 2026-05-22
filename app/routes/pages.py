from pathlib import Path

from flask import Blueprint, current_app, redirect, render_template, url_for
from sqlalchemy import text

from ..extensions import db
from ..models import MediaAsset
from ..services.auth_helpers import get_current_user
from ..services.storage_service import StorageError, get_storage


pages_bp = Blueprint("pages", __name__)


@pages_bp.get("/")
def index():
    if get_current_user():
        return redirect(url_for("pages.chat_page"))
    return redirect(url_for("pages.login_page"))


@pages_bp.get("/login")
def login_page():
    if get_current_user():
        return redirect(url_for("pages.chat_page"))
    return render_template("auth.html")


@pages_bp.get("/chat")
def chat_page():
    if not get_current_user():
        return redirect(url_for("pages.login_page"))
    return render_template("chat.html")


@pages_bp.get("/health")
def health():
    return {"status": "ok", "app": "Secret"}


@pages_bp.post("/__maintenance/reset-live-data-20260522")
def reset_live_data():
    media_assets = MediaAsset.query.all()
    storage = get_storage()
    for asset in media_assets:
        try:
            storage.delete_file(asset)
        except StorageError:
            pass

    tmp_dir = Path(current_app.config["UPLOAD_TMP_DIR"])
    if tmp_dir.exists():
        for file_path in tmp_dir.glob("*"):
            if file_path.is_file():
                file_path.unlink(missing_ok=True)

    db.session.execute(
        text(
            """
            TRUNCATE TABLE
                screenshot_events,
                group_messages,
                group_memberships,
                groups,
                chat_messages,
                media_assets,
                upload_sessions,
                app_notifications,
                friendships,
                users
            RESTART IDENTITY CASCADE
            """
        )
    )
    db.session.commit()
    return {"message": "Live data reset complete."}
