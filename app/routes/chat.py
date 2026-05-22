from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, desc, func, or_

from ..extensions import db
from ..models import ChatMessage, Group, GroupMembership, GroupMessage, User
from ..services.auth_helpers import (
    accepted_friendships_for,
    are_friends,
    get_current_user,
    is_group_member,
    login_required,
)
from ..services.notification_service import create_notification


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
                "type": "direct",
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


@chat_bp.get("/groups")
@login_required
def list_groups():
    user = get_current_user()
    memberships = (
        GroupMembership.query.filter_by(user_id=user.id)
        .order_by(desc(GroupMembership.joined_at))
        .all()
    )
    payload = []
    for membership in memberships:
        group = membership.group
        members = GroupMembership.query.filter_by(group_id=group.id).all()
        last_message = (
            GroupMessage.query.filter_by(group_id=group.id)
            .filter(GroupMessage.expires_at > datetime.utcnow())
            .order_by(desc(GroupMessage.created_at))
            .first()
        )
        payload.append(
            {
                **group.to_dict(members=members),
                "last_message": last_message.to_dict() if last_message else None,
            }
        )
    return jsonify({"groups": payload})


@chat_bp.post("/groups")
@login_required
def create_group():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    member_ids = sorted({int(member_id) for member_id in data.get("member_ids", []) if member_id})
    if not name:
        return jsonify({"error": "Group name is required."}), 400

    valid_members = User.query.filter(User.id.in_(member_ids)).all() if member_ids else []
    valid_user_ids = {member.id for member in valid_members}
    if len(valid_user_ids) != len(member_ids):
        return jsonify({"error": "One or more selected users do not exist."}), 400

    valid_users = {user.id, *valid_user_ids}

    group = Group(name=name, created_by=user.id)
    db.session.add(group)
    db.session.flush()

    created_memberships = []
    for member_id in valid_users:
        membership = GroupMembership(
            group_id=group.id,
            user_id=member_id,
            role="owner" if member_id == user.id else "member",
        )
        db.session.add(membership)
        created_memberships.append(membership)

    db.session.commit()

    for member_id in valid_user_ids:
        create_notification(
            recipient_id=member_id,
            actor_id=user.id,
            kind="group_added",
            title="Added to a new group",
            body=f"{user.username} added you to {group.name}.",
            resource_type="group",
            resource_id=group.id,
        )

    return jsonify({"group": group.to_dict(members=created_memberships)}), 201


@chat_bp.get("/groups/<group_id>/messages")
@login_required
def group_messages(group_id: str):
    user = get_current_user()
    if not is_group_member(group_id, user.id):
        return jsonify({"error": "You are not a member of this group."}), 403

    limit = min(int(request.args.get("limit", 60)), 250)
    messages = (
        GroupMessage.query.filter_by(group_id=group_id)
        .filter(GroupMessage.expires_at > datetime.utcnow())
        .order_by(desc(GroupMessage.created_at))
        .limit(limit)
        .all()
    )
    return jsonify({"messages": [message.to_dict() for message in reversed(messages)]})


@chat_bp.get("/groups/<group_id>/gallery")
@login_required
def group_gallery(group_id: str):
    user = get_current_user()
    if not is_group_member(group_id, user.id):
        return jsonify({"error": "You are not a member of this group."}), 403

    messages = (
        GroupMessage.query.filter_by(group_id=group_id)
        .filter(GroupMessage.media_id.isnot(None))
        .filter(GroupMessage.expires_at > datetime.utcnow())
        .order_by(desc(GroupMessage.created_at))
        .all()
    )
    return jsonify({"items": [message.to_dict() for message in messages]})
