from __future__ import annotations

from ..extensions import db, socketio
from ..models import AppNotification


def user_room(user_id: int) -> str:
    return f"user:{user_id}"


def create_notification(
    *,
    recipient_id: int,
    kind: str,
    title: str,
    body: str,
    actor_id: int | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> AppNotification:
    notification = AppNotification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        kind=kind,
        title=title,
        body=body,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    db.session.add(notification)
    db.session.commit()
    socketio.emit("notification:new", notification.to_dict(), room=user_room(recipient_id))
    return notification
