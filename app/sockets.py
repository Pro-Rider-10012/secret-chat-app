from datetime import datetime, timedelta

from flask import current_app, session
from flask_socketio import emit, join_room

from .extensions import db
from .models import ChatMessage, MediaAsset, ScreenshotEvent, User
from .services.auth_helpers import accepted_friendships_for, are_friends


def _room_for(user_id: int) -> str:
    return f"user:{user_id}"


def _friend_ids(user_id: int) -> list[int]:
    return [friendship.counterpart(user_id).id for friendship in accepted_friendships_for(user_id)]


def _broadcast_presence(socketio, user: User) -> None:
    payload = {
        "user_id": user.id,
        "is_online": user.is_online,
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
    }
    for friend_id in _friend_ids(user.id):
        socketio.emit("presence:update", payload, room=_room_for(friend_id))


def register_socket_handlers(socketio):
    @socketio.on("connect")
    def handle_connect():
        user_id = session.get("user_id")
        if not user_id:
            return False
        user = db.session.get(User, user_id)
        if not user:
            return False
        join_room(_room_for(user.id))
        user.is_online = True
        user.last_seen = datetime.utcnow()
        db.session.commit()
        _broadcast_presence(socketio, user)
        emit(
            "connected",
            {
                "user_id": user.id,
                "server_time": datetime.utcnow().isoformat(),
            },
        )

    @socketio.on("disconnect")
    def handle_disconnect():
        user_id = session.get("user_id")
        if not user_id:
            return
        user = db.session.get(User, user_id)
        if not user:
            return
        user.is_online = False
        user.last_seen = datetime.utcnow()
        db.session.commit()
        _broadcast_presence(socketio, user)

    @socketio.on("typing")
    def handle_typing(data):
        user_id = session.get("user_id")
        recipient_id = int(data.get("recipient_id", 0))
        if not user_id or not recipient_id or not are_friends(user_id, recipient_id):
            return
        socketio.emit(
            "typing",
            {"from_user_id": user_id},
            room=_room_for(recipient_id),
        )

    @socketio.on("send_message")
    def handle_send_message(data):
        user_id = session.get("user_id")
        if not user_id:
            return
        recipient_id = int(data.get("recipient_id", 0))
        if not recipient_id or not are_friends(user_id, recipient_id):
            emit("error_message", {"error": "You can only message accepted friends."})
            return

        kind = data.get("kind", "text")
        media_id = data.get("media_id")
        media = None
        if media_id:
            media = MediaAsset.query.get(media_id)
            if not media or media.owner_id != user_id:
                emit("error_message", {"error": "Invalid media attachment."})
                return

        message = ChatMessage(
            sender_id=user_id,
            recipient_id=recipient_id,
            kind=kind,
            sender_payload=data.get("sender_payload"),
            recipient_payload=data.get("recipient_payload"),
            media_id=media.id if media else None,
            expires_at=datetime.utcnow()
            + timedelta(hours=current_app.config["MESSAGE_TTL_HOURS"]),
        )
        db.session.add(message)
        db.session.commit()

        socketio.emit("message:new", message.to_dict_for(user_id), room=_room_for(user_id))
        socketio.emit(
            "message:new",
            message.to_dict_for(recipient_id),
            room=_room_for(recipient_id),
        )

    @socketio.on("message_seen")
    def handle_message_seen(data):
        user_id = session.get("user_id")
        if not user_id:
            return
        message = ChatMessage.query.get(data.get("message_id"))
        if not message or message.recipient_id != user_id:
            return
        if not message.is_seen:
            message.is_seen = True
            message.seen_at = datetime.utcnow()
            db.session.commit()

        socketio.emit(
            "message:seen",
            {
                "message_id": message.id,
                "seen_at": message.seen_at.isoformat() if message.seen_at else None,
                "viewer_id": user_id,
            },
            room=_room_for(message.sender_id),
        )

    @socketio.on("screenshot_detected")
    def handle_screenshot_detected(data):
        user_id = session.get("user_id")
        target_user_id = int(data.get("target_user_id", 0))
        if not user_id or not target_user_id or not are_friends(user_id, target_user_id):
            return

        event = ScreenshotEvent(
            reporter_id=user_id,
            target_user_id=target_user_id,
            conversation_user_id=target_user_id,
            reason=data.get("reason", "printscreen"),
        )
        db.session.add(event)
        db.session.commit()

        socketio.emit(
            "screenshot:alert",
            {
                "from_user_id": user_id,
                "reason": event.reason,
                "created_at": event.created_at.isoformat(),
            },
            room=_room_for(target_user_id),
        )
