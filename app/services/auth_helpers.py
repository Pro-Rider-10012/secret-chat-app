from __future__ import annotations

from functools import wraps

from flask import jsonify, session
from sqlalchemy import or_

from ..extensions import db
from ..models import Friendship, GroupMembership, User


def get_current_user() -> User | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.session.get(User, user_id)


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped


def find_friendship(user_a_id: int, user_b_id: int) -> Friendship | None:
    return Friendship.query.filter(
        or_(
            (Friendship.requester_id == user_a_id)
            & (Friendship.addressee_id == user_b_id),
            (Friendship.requester_id == user_b_id)
            & (Friendship.addressee_id == user_a_id),
        )
    ).first()


def are_friends(user_a_id: int, user_b_id: int) -> bool:
    friendship = find_friendship(user_a_id, user_b_id)
    return bool(friendship and friendship.status == "accepted")


def accepted_friendships_for(user_id: int) -> list[Friendship]:
    return Friendship.query.filter(
        Friendship.status == "accepted",
        or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
    ).all()


def is_group_member(group_id: str, user_id: int) -> bool:
    return GroupMembership.query.filter_by(group_id=group_id, user_id=user_id).first() is not None


def group_memberships_for(user_id: int) -> list[GroupMembership]:
    return GroupMembership.query.filter_by(user_id=user_id).all()
