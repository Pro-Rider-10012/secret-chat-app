# Secret

Secret is a privacy-focused Snapchat-style realtime chat application built with Flask, Socket.IO, PostgreSQL, vanilla HTML/CSS/JS, Twilio OTP, and S3-compatible media storage.

## 1. Folder Structure

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
|   |   `-- pages.py
|   |-- services/
|   |   |-- auth_helpers.py
|   |   |-- otp_service.py
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
|-- .gitignore
|-- render.yaml
|-- requirements.txt
|-- run.py
`-- README.md
```

## 2. Database Schema

The main tables are:

1. `users`: phone-based accounts, binary password hash, public key, encrypted private key, presence state.
2. `friendships`: request, accept, reject workflow and friend-only chat enforcement.
3. `chat_messages`: encrypted message payloads, media link, seen state, 24-hour expiry.
4. `media_assets`: S3 or local storage metadata and expiry.
5. `upload_sessions`: resumable chunk-upload session state for large files.
6. `screenshot_events`: PrintScreen and tab-hide notifications.

Reference SQL: [database/schema.sql](C:\D dirve\Projects\Chatting app\database\schema.sql)

## 3. Backend APIs

### Authentication

1. `POST /api/auth/request-otp`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `GET /api/auth/session`
5. `POST /api/auth/logout`

### Friends

1. `GET /api/friends`
2. `GET /api/friends/requests`
3. `POST /api/friends/request`
4. `POST /api/friends/request/<id>/accept`
5. `POST /api/friends/request/<id>/reject`

### Chat

1. `GET /api/conversations`
2. `GET /api/messages/<friend_id>`
3. `GET /api/gallery/<friend_id>`

### Media

1. `POST /api/media/upload-sessions`
2. `PUT /api/media/upload-sessions/<id>/chunk?offset=<bytes>`
3. `POST /api/media/upload-sessions/<id>/complete`
4. `GET /api/media/<id>/download`

### WebSocket Events

1. `send_message`
2. `typing`
3. `message_seen`
4. `screenshot_detected`
5. `message:new`
6. `message:seen`
7. `presence:update`
8. `screenshot:alert`

## 4. Authentication System

Registration flow:

1. User enters phone number, username, and password.
2. `request-otp` sends an SMS via Twilio Verify when configured.
3. In local development, a debug OTP is returned in the API response when `EXPOSE_DEBUG_OTP=true`.
4. The browser generates an RSA key pair.
5. The private key is encrypted in the browser with a password-derived AES key.
6. `register` stores the public key, encrypted private key, and binary password hash.

Login flow:

1. User logs in with phone number and password.
2. Flask stores the user session cookie.
3. The frontend unlocks the encrypted private key locally to decrypt messages.

## 5. Chat System

1. Only accepted friends can exchange messages.
2. Text payloads are encrypted in the browser before they are emitted over Socket.IO.
3. Each text is encrypted separately for sender and recipient.
4. Presence, typing, seen status, and screenshot alerts are pushed in realtime.
5. Messages automatically expire after 24 hours.

## 6. Media Upload System

1. Client starts an upload session with file metadata.
2. Browser slices large image and video files into chunks.
3. Each chunk is streamed to the backend and appended to a temporary file.
4. The completed file is pushed to S3-compatible storage.
5. Only the storage URL and key metadata are stored in PostgreSQL.
6. Downloads are streamed through authenticated Flask endpoints.

For production, configure AWS S3. If S3 variables are omitted, the app falls back to local storage for local development.

## 7. Frontend UI

The UI includes:

1. Secret branding in the login page and chat page.
2. Neon lock logo and favicon.
3. Blue hacker theme with Orbitron and Share Tech Mono fonts.
4. Responsive sidebar/chat/gallery layout.
5. Stylish login/register flow with OTP stage.
6. Modern bubbles for encrypted text, images, and videos.

## 8. Scheduler System

The APScheduler background worker runs inside the Flask process when `ENABLE_SCHEDULER=true`.

It performs:

1. Expired message cleanup.
2. Expired media cleanup in storage.
3. Stale upload cleanup for abandoned chunk uploads.

## 9. Deployment Setup

### Environment Variables

Copy [.env.example](C:\D dirve\Projects\Chatting app\.env.example) to `.env` and fill in:

1. `SECRET_KEY`
2. `DATABASE_URL`
3. Twilio Verify credentials
4. AWS S3 credentials
5. Cookie/security toggles

### Local Run Instructions

1. Install Python 3.11 and PostgreSQL.
2. Create a PostgreSQL database named `secret`.
3. Create and activate a virtual environment.
4. Install dependencies:

```bash
pip install -r requirements.txt
```

5. Copy env file:

```bash
cp .env.example .env
```

6. Update `.env` with your PostgreSQL URL and optional Twilio/S3 credentials.
7. Run the app:

```bash
python run.py
```

8. Open `http://localhost:5000`.

### Render Deployment Guide

1. Push this project to GitHub.
2. Create a new PostgreSQL database in Render.
3. Create a new Web Service from the repository.
4. Use `render.yaml` or set these manually:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn --worker-class eventlet -w 1 run:app`
5. Set env vars in Render:
   - `DATABASE_URL`
   - `SECRET_KEY`
   - `SESSION_COOKIE_SECURE=true`
   - `ENABLE_SCHEDULER=true`
   - `EXPOSE_DEBUG_OTP=false`
   - Twilio credentials
   - AWS S3 credentials
6. Keep one web worker if the scheduler runs inside the web service.

## Security Notes

1. Password hashes are stored as binary bytes in PostgreSQL.
2. Text messages are end-to-end encrypted in the browser before transit and storage.
3. Media downloads require an authenticated session.
4. Friend-only messaging blocks unsolicited chat access.
5. Screenshot detection is best-effort because browsers cannot guarantee OS-level screenshot capture detection.

## Known Production Follow-Ups

1. Move from `db.create_all()` to Alembic migrations before a multi-stage rollout.
2. Add chunk retry/resume tokens for interrupted very large uploads.
3. Encrypt media client-side as well if you need E2E guarantees beyond text payloads.
4. Add rate limiting and audit logging before public launch.
