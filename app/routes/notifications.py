from datetime import datetime

from flask import Blueprint, jsonify

from ..extensions import db
from ..models import AppNotification
from ..services.auth_helpers import get_current_user, login_required


notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.get("")
@login_required
def list_notifications():
    user = get_current_user()
    notifications = (
        AppNotification.query.filter_by(recipient_id=user.id)
        .order_by(AppNotification.created_at.desc())
        .limit(100)
        .all()
    )
    unread_count = AppNotification.query.filter_by(recipient_id=user.id, is_read=False).count()
    return jsonify(
        {
            "notifications": [notification.to_dict() for notification in notifications],
            "unread_count": unread_count,
            "server_time": datetime.utcnow().isoformat(),
        }
    )


@notifications_bp.post("/<notification_id>/read")
@login_required
def mark_notification_read(notification_id: str):
    user = get_current_user()
    notification = AppNotification.query.filter_by(id=notification_id, recipient_id=user.id).first_or_404()
    notification.is_read = True
    db.session.commit()
    return jsonify({"message": "Notification marked as read."})


@notifications_bp.post("/read-all")
@login_required
def mark_all_read():
    user = get_current_user()
    AppNotification.query.filter_by(recipient_id=user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All notifications marked as read."})
