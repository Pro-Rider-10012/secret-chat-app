import { get, post } from "./api.js";
import { decryptPayload, encryptForPublicKey, unlockIdentity } from "./crypto.js";

const state = {
    session: null,
    privateKey: null,
    socket: null,
    activeFriendId: null,
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    conversations: [],
    gallery: [],
};

const elements = {
    conversationList: document.getElementById("conversation-list"),
    incomingRequests: document.getElementById("incoming-requests"),
    requestCount: document.getElementById("request-count"),
    friendCount: document.getElementById("friend-count"),
    activeFriendName: document.getElementById("active-friend-name"),
    activeFriendStatus: document.getElementById("active-friend-status"),
    messageStream: document.getElementById("message-stream"),
    typingIndicator: document.getElementById("typing-indicator"),
    messageInput: document.getElementById("message-input"),
    sendButton: document.getElementById("send-button"),
    mediaInput: document.getElementById("media-input"),
    uploadProgress: document.getElementById("upload-progress"),
    galleryGrid: document.getElementById("gallery-grid"),
    logoutButton: document.getElementById("logout-button"),
    friendForm: document.getElementById("friend-form"),
    friendPhone: document.getElementById("friend-phone"),
    refreshGallery: document.getElementById("refresh-gallery"),
    toast: document.getElementById("toast"),
};

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => elements.toast.classList.add("hidden"), 3200);
}

function activeFriend() {
    return state.friends.find((entry) => entry.friend.id === state.activeFriendId)?.friend || null;
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeSeen(friend) {
    if (!friend) {
        return "Choose a verified friend.";
    }
    return friend.is_online
        ? "Online now"
        : `Last seen ${new Date(friend.last_seen).toLocaleString()}`;
}

async function hydrateMessage(message) {
    const text = message.payload ? await decryptPayload(state.privateKey, message.payload) : "";
    return { ...message, text };
}

function renderRequests() {
    elements.requestCount.textContent = String(state.incomingRequests.length);
    if (!state.incomingRequests.length) {
        elements.incomingRequests.textContent = "No incoming requests.";
        elements.incomingRequests.classList.add("empty-state-text");
        return;
    }

    elements.incomingRequests.classList.remove("empty-state-text");
    elements.incomingRequests.innerHTML = state.incomingRequests.map((request) => `
        <article class="request-item">
            <div class="request-line">
                <div>
                    <strong>${request.friend.username}</strong>
                    <div>${request.friend.phone_number}</div>
                </div>
                <div class="request-actions">
                    <button class="tiny-button" data-accept="${request.id}">Accept</button>
                    <button class="tiny-button reject" data-reject="${request.id}">Reject</button>
                </div>
            </div>
        </article>
    `).join("");
}

function renderConversations() {
    elements.friendCount.textContent = String(state.conversations.length);
    if (!state.conversations.length) {
        elements.conversationList.textContent = "Add a friend to start chatting.";
        elements.conversationList.classList.add("empty-state-text");
        return;
    }

    elements.conversationList.classList.remove("empty-state-text");
    elements.conversationList.innerHTML = state.conversations.map((conversation) => {
        const friend = conversation.friend;
        const activeClass = friend.id === state.activeFriendId ? "active" : "";
        const preview = conversation.last_message?.text || conversation.last_message?.kind?.toUpperCase() || "No messages yet";
        return `
            <article class="conversation-item ${activeClass}" data-friend="${friend.id}">
                <div class="friend-line">
                    <div class="friend-main">
                        <span class="status-dot ${friend.is_online ? "online" : ""}"></span>
                        <div>
                            <strong>${friend.username}</strong>
                            <div>${preview.slice(0, 48)}</div>
                        </div>
                    </div>
                    <span class="pill">${conversation.unread_count || 0}</span>
                </div>
            </article>
        `;
    }).join("");
}

function renderMessageStream(messages) {
    if (!messages.length) {
        elements.messageStream.innerHTML = `
            <div class="empty-state">
                <h3>No messages yet</h3>
                <p>Send the first encrypted message to begin this 24-hour conversation.</p>
            </div>
        `;
        return;
    }

    elements.messageStream.innerHTML = messages.map((message) => {
        const mine = message.sender_id === state.session.user.id;
        const seenText = mine && message.is_seen ? "Seen" : mine ? "Sent" : "Incoming";
        const mediaMarkup = message.media ? `
            <div class="message-media">
                ${message.kind === "video"
                    ? `<video controls preload="metadata" src="${message.media.preview_url}"></video>`
                    : `<img src="${message.media.preview_url}" alt="${message.media.file_name}">`}
            </div>
            <a class="download-link" href="${message.media.download_url}?download=1">Download</a>
        ` : "";

        return `
            <article class="message-card ${mine ? "mine" : ""}">
                <div class="message-meta">
                    <span>${mine ? "You" : activeFriend()?.username || "Friend"}</span>
                    <span>${formatTime(message.created_at)} | ${seenText}</span>
                </div>
                ${message.text ? `<div>${message.text}</div>` : ""}
                ${mediaMarkup}
            </article>
        `;
    }).join("");
    elements.messageStream.scrollTop = elements.messageStream.scrollHeight;
}

function renderGallery() {
    if (!state.gallery.length) {
        elements.galleryGrid.textContent = "Media you share in Secret appears here until it expires.";
        elements.galleryGrid.classList.add("empty-state-text");
        return;
    }

    elements.galleryGrid.classList.remove("empty-state-text");
    elements.galleryGrid.innerHTML = state.gallery.map((item) => `
        <article class="gallery-item">
            ${item.kind === "video"
                ? `<video controls preload="metadata" src="${item.media.preview_url}"></video>`
                : `<img src="${item.media.preview_url}" alt="${item.media.file_name}">`}
        </article>
    `).join("");
}

async function fetchRequests() {
    const payload = await get("/api/friends/requests");
    state.incomingRequests = payload.incoming;
    state.outgoingRequests = payload.outgoing;
    renderRequests();
}

async function fetchFriendsAndConversations() {
    const [friendsPayload, conversationsPayload] = await Promise.all([
        get("/api/friends"),
        get("/api/conversations"),
    ]);
    state.friends = friendsPayload.friends;
    state.conversations = await Promise.all(
        conversationsPayload.conversations.map(async (conversation) => ({
            ...conversation,
            last_message: conversation.last_message
                ? await hydrateMessage(conversation.last_message)
                : null,
        })),
    );
    if (!state.activeFriendId && state.conversations[0]?.friend?.id) {
        state.activeFriendId = state.conversations[0].friend.id;
    }
    renderConversations();
}

async function fetchMessages(friendId) {
    const payload = await get(`/api/messages/${friendId}`);
    const messages = await Promise.all(payload.messages.map(hydrateMessage));
    renderMessageStream(messages);
    await Promise.all(
        messages
            .filter((message) => message.recipient_id === state.session.user.id && !message.is_seen)
            .map((message) => markSeen(message.id)),
    );
}

async function fetchGallery(friendId) {
    if (!friendId) {
        state.gallery = [];
        renderGallery();
        return;
    }
    const payload = await get(`/api/gallery/${friendId}`);
    state.gallery = await Promise.all(payload.items.map(hydrateMessage));
    renderGallery();
}

async function selectFriend(friendId) {
    state.activeFriendId = Number(friendId);
    const friend = activeFriend();
    elements.activeFriendName.textContent = friend?.username || "Choose a friend";
    elements.activeFriendStatus.textContent = relativeSeen(friend);
    renderConversations();
    await fetchMessages(friendId);
    await fetchGallery(friendId);
}

async function markSeen(messageId) {
    state.socket.emit("message_seen", { message_id: messageId });
}

async function sendEncryptedMessage(kind = "text", media = null) {
    const friend = activeFriend();
    const text = elements.messageInput.value.trim();
    if (!friend) {
        showToast("Choose a friend first.");
        return;
    }
    if (!text && !media) {
        return;
    }

    const [senderPayload, recipientPayload] = await Promise.all([
        text ? encryptForPublicKey(state.session.user.public_key, text) : Promise.resolve(null),
        text ? encryptForPublicKey(friend.public_key, text) : Promise.resolve(null),
    ]);

    state.socket.emit("send_message", {
        recipient_id: friend.id,
        kind,
        sender_payload: senderPayload,
        recipient_payload: recipientPayload,
        media_id: media?.id || null,
    });
    elements.messageInput.value = "";
}

async function uploadMedia(file) {
    const mediaType = file.type.startsWith("video") ? "video" : "image";
    const metadata = await post("/api/media/upload-sessions", {
        filename: file.name,
        content_type: file.type,
        total_size: file.size,
        chunk_size: 5 * 1024 * 1024,
        media_type: mediaType,
    });

    let offset = 0;
    const chunkSize = metadata.chunk_size;
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        await fetch(`/api/media/upload-sessions/${metadata.upload_id}/chunk?offset=${offset}`, {
            method: "PUT",
            body: chunk,
            credentials: "same-origin",
        }).then(async (response) => {
            if (!response.ok) {
                const payload = await response.json();
                throw new Error(payload.error || "Chunk upload failed.");
            }
        });
        offset += chunk.size;
        elements.uploadProgress.textContent = `Uploading ${file.name}: ${Math.round((offset / file.size) * 100)}%`;
    }

    const payload = await post(`/api/media/upload-sessions/${metadata.upload_id}/complete`, {});
    elements.uploadProgress.textContent = `${file.name} uploaded securely.`;
    return payload.media;
}

function bindSocket() {
    state.socket = io();
    state.socket.on("message:new", async (message) => {
        const hydrated = await hydrateMessage(message);
        if (hydrated.counterpart_id === state.activeFriendId || hydrated.sender_id === state.activeFriendId) {
            await fetchMessages(state.activeFriendId);
            await fetchGallery(state.activeFriendId);
        }
        await fetchFriendsAndConversations();
    });
    state.socket.on("typing", ({ from_user_id }) => {
        if (from_user_id === state.activeFriendId) {
            elements.typingIndicator.textContent = `${activeFriend()?.username || "Friend"} is typing...`;
            clearTimeout(bindSocket.typingTimeout);
            bindSocket.typingTimeout = setTimeout(() => {
                elements.typingIndicator.textContent = "";
            }, 1800);
        }
    });
    state.socket.on("presence:update", async ({ user_id, is_online, last_seen }) => {
        state.friends = state.friends.map((entry) => (
            entry.friend.id === user_id
                ? { ...entry, friend: { ...entry.friend, is_online, last_seen } }
                : entry
        ));
        state.conversations = state.conversations.map((entry) => (
            entry.friend.id === user_id
                ? { ...entry, friend: { ...entry.friend, is_online, last_seen } }
                : entry
        ));
        if (state.activeFriendId === user_id) {
            elements.activeFriendStatus.textContent = relativeSeen(activeFriend());
        }
        renderConversations();
    });
    state.socket.on("message:seen", async () => {
        if (state.activeFriendId) {
            await fetchMessages(state.activeFriendId);
        }
    });
    state.socket.on("screenshot:alert", ({ from_user_id, reason }) => {
        const friend = state.friends.find((entry) => entry.friend.id === from_user_id)?.friend;
        showToast(`${friend?.username || "A friend"} triggered a ${reason} alert.`);
    });
}

async function boot() {
    try {
        state.session = await get("/api/auth/session");
    } catch {
        window.location.href = "/login";
        return;
    }

    const password = sessionStorage.getItem("secret.unlock.password") || window.prompt("Enter your Secret password to unlock encrypted chats");
    if (!password) {
        window.location.href = "/login";
        return;
    }

    try {
        state.privateKey = await unlockIdentity(
            state.session.encrypted_private_key,
            password,
            state.session.key_encryption_salt,
        );
    } catch (error) {
        showToast("Could not unlock your private key. Please log in again.");
        sessionStorage.removeItem("secret.unlock.password");
        window.location.href = "/login";
        return;
    }

    bindSocket();
    await fetchRequests();
    await fetchFriendsAndConversations();
    if (state.activeFriendId) {
        await selectFriend(state.activeFriendId);
    }
}

elements.friendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await post("/api/friends/request", { phone_number: elements.friendPhone.value.trim() });
        elements.friendPhone.value = "";
        showToast("Friend request sent.");
        await fetchRequests();
    } catch (error) {
        showToast(error.message);
    }
});

elements.incomingRequests.addEventListener("click", async (event) => {
    const acceptId = event.target.dataset.accept;
    const rejectId = event.target.dataset.reject;
    try {
        if (acceptId) {
            await post(`/api/friends/request/${acceptId}/accept`, {});
        }
        if (rejectId) {
            await post(`/api/friends/request/${rejectId}/reject`, {});
        }
        await fetchRequests();
        await fetchFriendsAndConversations();
    } catch (error) {
        showToast(error.message);
    }
});

elements.conversationList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-friend]");
    if (!card) {
        return;
    }
    await selectFriend(Number(card.dataset.friend));
});

elements.sendButton.addEventListener("click", async () => {
    try {
        await sendEncryptedMessage();
    } catch (error) {
        showToast(error.message);
    }
});

elements.messageInput.addEventListener("input", () => {
    if (state.activeFriendId) {
        state.socket?.emit("typing", { recipient_id: state.activeFriendId });
    }
});

elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "PrintScreen" && state.activeFriendId) {
        state.socket?.emit("screenshot_detected", {
            target_user_id: state.activeFriendId,
            reason: "printscreen",
        });
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.activeFriendId) {
        state.socket?.emit("screenshot_detected", {
            target_user_id: state.activeFriendId,
            reason: "tab_hidden",
        });
    }
});

elements.mediaInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }
    try {
        const media = await uploadMedia(file);
        const kind = media.media_type === "video" ? "video" : "image";
        await sendEncryptedMessage(kind, media);
        await fetchGallery(state.activeFriendId);
        elements.mediaInput.value = "";
    } catch (error) {
        showToast(error.message);
        elements.uploadProgress.textContent = "";
    }
});

elements.refreshGallery.addEventListener("click", async () => {
    await fetchGallery(state.activeFriendId);
});

elements.logoutButton.addEventListener("click", async () => {
    await post("/api/auth/logout", {});
    sessionStorage.removeItem("secret.unlock.password");
    window.location.href = "/login";
});

boot();


