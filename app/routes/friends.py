from datetime import datetime

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Friendship, User
from ..services.auth_helpers import (
    accepted_friendships_for,
    find_friendship,
    get_current_user,
    login_required,
)


friends_bp = Blueprint("friends", __name__, url_prefix="/api/friends")


@friends_bp.get("")
@login_required
def list_friends():
    user = get_current_user()
    friendships = accepted_friendships_for(user.id)
    return jsonify({"friends": [friendship.to_dict_for(user.id) for friendship in friendships]})


@friends_bp.get("/requests")
@login_required
def list_requests():
    user = get_current_user()
    incoming = Friendship.query.filter_by(addressee_id=user.id, status="pending").all()
    outgoing = Friendship.query.filter_by(requester_id=user.id, status="pending").all()
    return jsonify(
        {
            "incoming": [friendship.to_dict_for(user.id) for friendship in incoming],
            "outgoing": [friendship.to_dict_for(user.id) for friendship in outgoing],
        }
    )


@friends_bp.post("/request")
@login_required
def send_friend_request():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    phone_number = (data.get("phone_number") or "").strip()
    friend = User.query.filter_by(phone_number=phone_number).first()
    if not friend:
        return jsonify({"error": "No user found with that phone number."}), 404
    if friend.id == user.id:
        return jsonify({"error": "You cannot add yourself."}), 400

    existing = find_friendship(user.id, friend.id)
    if existing:
        if existing.status == "accepted":
            return jsonify({"error": "You are already friends."}), 409
        if existing.status == "pending":
            return jsonify({"error": "A friend request already exists."}), 409
        if existing.status == "rejected":
            existing.status = "pending"
            existing.requester_id = user.id
            existing.addressee_id = friend.id
            existing.responded_at = None
            db.session.commit()
            return jsonify({"message": "Friend request sent again."})

    friendship = Friendship(requester_id=user.id, addressee_id=friend.id, status="pending")
    db.session.add(friendship)
    db.session.commit()
    return jsonify({"message": "Friend request sent."}), 201


@friends_bp.post("/request/<int:friendship_id>/accept")
@login_required
def accept_request(friendship_id: int):
    user = get_current_user()
    friendship = Friendship.query.get_or_404(friendship_id)
    if friendship.addressee_id != user.id or friendship.status != "pending":
        return jsonify({"error": "This request cannot be accepted."}), 403
    friendship.status = "accepted"
    friendship.responded_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Friend request accepted."})


@friends_bp.post("/request/<int:friendship_id>/reject")
@login_required
def reject_request(friendship_id: int):
    user = get_current_user()
    friendship = Friendship.query.get_or_404(friendship_id)
    if friendship.addressee_id != user.id or friendship.status != "pending":
        return jsonify({"error": "This request cannot be rejected."}), 403
    friendship.status = "rejected"
    friendship.responded_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Friend request rejected."})
