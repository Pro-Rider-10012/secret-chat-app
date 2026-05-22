# Secret

Secret is a classic-style private messenger built with Flask, Socket.IO, PostgreSQL, and vanilla HTML/CSS/JavaScript. It supports direct chat, group chat, voice notes, media sharing, notifications, screenshot alerts, and browser-based video calling.

## Features

- Phone number + password registration and login
- End-to-end encrypted direct text messages
- Friend requests and friend-only direct chats
- User directory for finding everyone on the app
- Realtime notifications for new messages and friend requests
- Group creation and group chat
- Voice messages with `MediaRecorder`
- Browser video chat with WebRTC signaling over Socket.IO
- Image, video, and audio uploads with chunked media transfer
- 24-hour expiry cleanup for messages and media
- Classic UI with a simpler, calmer visual style

## Project Structure

```text
Chatting app/
|-- app/
|   |-- __init__.py
|   |-- config.py
|   |-- extensions.py
|   |-- models.py
|   |-- sockets.py
|   |-- tasks.py
|   |-- routes/
|   |   |-- auth.py
|   |   |-- chat.py
|   |   |-- friends.py
|   |   |-- media.py
|   |   |-- notifications.py
|   |   `-- pages.py
|   |-- services/
|   |   |-- auth_helpers.py
|   |   |-- notification_service.py
|   |   `-- storage_service.py
|   |-- static/
|   |   |-- css/style.css
|   |   |-- img/favicon.svg
|   |   |-- img/logo.svg
|   |   `-- js/
|   |       |-- api.js
|   |       |-- auth.js
|   |       |-- chat.js
|   |       `-- crypto.js
|   `-- templates/
|       |-- auth.html
|       |-- base.html
|       `-- chat.html
|-- database/schema.sql
|-- .env.example
|-- render.yaml
|-- requirements.txt
|-- run.py
`-- README.md
```

## Main Database Tables

- `users`
- `friendships`
- `app_notifications`
- `groups`
- `group_memberships`
- `chat_messages`
- `group_messages`
- `media_assets`
- `upload_sessions`
- `screenshot_events`

Reference SQL: [database/schema.sql](database/schema.sql)

## Core API Routes

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`

### Friends and Directory

- `GET /api/friends`
- `GET /api/friends/directory`
- `GET /api/friends/requests`
- `POST /api/friends/request`
- `POST /api/friends/request/<id>/accept`
- `POST /api/friends/request/<id>/reject`

### Direct and Group Chat

- `GET /api/conversations`
- `GET /api/messages/<friend_id>`
- `GET /api/gallery/<friend_id>`
- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/<group_id>/messages`
- `GET /api/groups/<group_id>/gallery`

### Notifications

- `GET /api/notifications`
- `POST /api/notifications/<id>/read`
- `POST /api/notifications/read-all`

### Media

- `POST /api/media/upload-sessions`
- `PUT /api/media/upload-sessions/<id>/chunk?offset=<bytes>`
- `POST /api/media/upload-sessions/<id>/complete`
- `GET /api/media/<id>/download`

## Socket Events

### Direct chat

- `send_message`
- `typing`
- `message_seen`
- `message:new`
- `message:seen`
- `presence:update`
- `screenshot_detected`
- `screenshot:alert`

### Groups

- `group:subscribe`
- `group:typing`
- `send_group_message`
- `group:message:new`

### Video calling

- `call:offer`
- `call:answer`
- `call:ice-candidate`
- `call:end`

### Notifications

- `notification:new`

## Local Setup

1. Install Python 3.11 and PostgreSQL.
2. Create a PostgreSQL database named `secret`.
3. Create a virtual environment.
4. Install dependencies:

```bash
pip install -r requirements.txt
```

5. Copy the env file:

```bash
cp .env.example .env
```

6. Fill in `.env`.
7. Run the app:

```bash
python run.py
```

8. Open `http://localhost:5000`.

## Environment Variables

Required:

- `SECRET_KEY`
- `DATABASE_URL`

Optional but recommended:

- `SESSION_COOKIE_SECURE`
- `ENABLE_SCHEDULER`
- `MESSAGE_TTL_HOURS`
- `MAX_CHUNK_SIZE`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`
- `AWS_S3_REGION`
- `AWS_S3_ENDPOINT_URL`

## Render Deployment

This repo includes `render.yaml` with:

- Python web service
- `gunicorn --worker-class eventlet -w 1 run:app`
- `/health` health check

Typical Render setup:

1. Connect the GitHub repo.
2. Attach a PostgreSQL database.
3. Set `DATABASE_URL`.
4. Set a strong `SECRET_KEY`.
5. Set `SESSION_COOKIE_SECURE=true`.
6. Add S3 credentials if you want persistent media storage.
7. Deploy.

## Security Notes

- Direct text messages are encrypted in the browser before storage and transport.
- Password hashes are stored as binary bytes.
- Media access is authenticated.
- Screenshot detection is best-effort only because browsers cannot fully detect OS-level captures.
- Group messages are server-protected, but they are not using the same per-recipient E2E scheme as direct text chat.

## Production Follow-Ups

- Move from `db.create_all()` to Alembic migrations
- Add TURN servers for stronger video call reliability on restrictive networks
- Add client-side media encryption if full E2E media protection is needed
- Add rate limiting and abuse controls before public launch
