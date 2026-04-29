from datetime import datetime

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, desc, func, or_

from ..models import ChatMessage
from ..services.auth_helpers import (
    accepted_friendships_for,
    are_friends,
    get_current_user,
    login_required,
)


chat_bp = Blueprint("chat", __name__, url_prefix="/api")


def _conversation_filter(user_id: int, friend_id: int):
    return or_(
        and_(ChatMessage.sender_id == user_id, ChatMessage.recipient_id == friend_id),
        and_(ChatMessage.sender_id == friend_id, ChatMessage.recipient_id == user_id),
    )


@chat_bp.get("/conversations")
@login_required
def conversations():
    user = get_current_user()
    payload = []
    for friendship in accepted_friendships_for(user.id):
        friend = friendship.counterpart(user.id)
        last_message = (
            ChatMessage.query.filter(_conversation_filter(user.id, friend.id))
            .order_by(desc(ChatMessage.created_at))
            .first()
        )
        unread_count = (
            ChatMessage.query.filter_by(recipient_id=user.id, sender_id=friend.id, is_seen=False)
            .filter(ChatMessage.expires_at > datetime.utcnow())
            .with_entities(func.count(ChatMessage.id))
            .scalar()
        )
        payload.append(
            {
                "friend": friend.to_public_dict(),
                "last_message": last_message.to_dict_for(user.id) if last_message else None,
                "unread_count": unread_count or 0,
            }
        )

    payload.sort(
        key=lambda item: item["last_message"]["created_at"]
        if item["last_message"]
        else "1970-01-01T00:00:00",
        reverse=True,
    )
    return jsonify({"conversations": payload})


@chat_bp.get("/messages/<int:friend_id>")
@login_required
def messages(friend_id: int):
    user = get_current_user()
    if not are_friends(user.id, friend_id):
        return jsonify({"error": "You can only chat with accepted friends."}), 403

    limit = min(int(request.args.get("limit", 50)), 200)
    query = (
        ChatMessage.query.filter(_conversation_filter(user.id, friend_id))
        .filter(ChatMessage.expires_at > datetime.utcnow())
        .order_by(desc(ChatMessage.created_at))
        .limit(limit)
    )
    results = list(reversed(query.all()))
    return jsonify({"messages": [message.to_dict_for(user.id) for message in results]})


@chat_bp.get("/gallery/<int:friend_id>")
@login_required
def gallery(friend_id: int):
    user = get_current_user()
    if not are_friends(user.id, friend_id):
        return jsonify({"error": "You can only view galleries for friends."}), 403

    media_messages = (
        ChatMessage.query.filter(_conversation_filter(user.id, friend_id))
        .filter(ChatMessage.media_id.isnot(None))
        .filter(ChatMessage.expires_at > datetime.utcnow())
        .order_by(desc(ChatMessage.created_at))
        .all()
    )
    gallery_items = [message.to_dict_for(user.id) for message in media_messages]
    return jsonify({"items": gallery_items})
