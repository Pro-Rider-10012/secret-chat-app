from flask import Blueprint, redirect, render_template, url_for

from ..services.auth_helpers import get_current_user


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
