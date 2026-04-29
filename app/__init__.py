from flask import Flask

from .config import Config
from .extensions import db, socketio
from .routes.auth import auth_bp
from .routes.chat import chat_bp
from .routes.friends import friends_bp
from .routes.media import media_bp
from .routes.pages import pages_bp
from .sockets import register_socket_handlers
from .tasks import configure_scheduler


def create_app() -> Flask:
    Config.ensure_dirs()
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    socketio.init_app(app)

    app.register_blueprint(pages_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(friends_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(media_bp)

    with app.app_context():
        db.create_all()

    register_socket_handlers(socketio)
    configure_scheduler(app)
    return app
