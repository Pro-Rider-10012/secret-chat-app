import eventlet


eventlet.monkey_patch()

import os

from dotenv import load_dotenv

from app import create_app
from app.extensions import socketio


load_dotenv()

app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    socketio.run(app, host="0.0.0.0", port=port, debug=True)
