import { get, post } from "./api.js";
import { decryptPayload, encryptForPublicKey, unlockIdentity } from "./crypto.js";

const state = {
    session: null,
    privateKey: null,
    socket: null,
    notifications: [],
    directory: [],
    incomingRequests: [],
    conversations: [],
    groups: [],
    gallery: [],
    activeChat: null,
    mediaRecorder: null,
    recordedChunks: [],
    call: {
        peer: null,
        localStream: null,
        remoteStream: null,
        withUserId: null,
    },
};

const elements = {
    notificationButton: document.getElementById("notification-button"),
    notificationCount: document.getElementById("notification-count"),
    notificationList: document.getElementById("notification-list"),
    markAllRead: document.getElementById("mark-all-read"),
    logoutButton: document.getElementById("logout-button"),
    incomingRequests: document.getElementById("incoming-requests"),
    requestCount: document.getElementById("request-count"),
    directoryList: document.getElementById("directory-list"),
    directoryCount: document.getElementById("directory-count"),
    conversationList: document.getElementById("conversation-list"),
    friendCount: document.getElementById("friend-count"),
    groupList: document.getElementById("group-list"),
    groupCount: document.getElementById("group-count"),
    groupForm: document.getElementById("group-form"),
    groupName: document.getElementById("group-name"),
    groupMemberPicker: document.getElementById("group-member-picker"),
    friendForm: document.getElementById("friend-form"),
    friendPhone: document.getElementById("friend-phone"),
    activeChatType: document.getElementById("active-chat-type"),
    activeChatName: document.getElementById("active-chat-name"),
    activeChatStatus: document.getElementById("active-chat-status"),
    videoCallButton: document.getElementById("video-call-button"),
    endCallButton: document.getElementById("end-call-button"),
    callPanel: document.getElementById("call-panel"),
    callStatus: document.getElementById("call-status"),
    localVideo: document.getElementById("local-video"),
    remoteVideo: document.getElementById("remote-video"),
    messageStream: document.getElementById("message-stream"),
    typingIndicator: document.getElementById("typing-indicator"),
    messageInput: document.getElementById("message-input"),
    mediaInput: document.getElementById("media-input"),
    recordVoiceButton: document.getElementById("record-voice-button"),
    recordingStatus: document.getElementById("recording-status"),
    uploadProgress: document.getElementById("upload-progress"),
    sendButton: document.getElementById("send-button"),
    refreshGallery: document.getElementById("refresh-gallery"),
    galleryGrid: document.getElementById("gallery-grid"),
    toast: document.getElementById("toast"),
};

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => elements.toast.classList.add("hidden"), 3200);
}

function maybeNotify(title, body) {
    if (window.Notification && Notification.permission === "granted") {
        new Notification(title, { body });
    }
}

function activeDirectFriend() {
    if (!state.activeChat || state.activeChat.type !== "direct") {
        return null;
    }
    return state.conversations.find((item) => item.friend.id === state.activeChat.id)?.friend || null;
}

function activeGroup() {
    if (!state.activeChat || state.activeChat.type !== "group") {
        return null;
    }
    return state.groups.find((group) => group.id === state.activeChat.id) || null;
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value) {
    return new Date(value).toLocaleString();
}

async function decodePayload(payload) {
    if (!payload) {
        return "";
    }
    try {
        return await decryptPayload(state.privateKey, payload);
    } catch {
        return typeof payload === "string" ? payload : JSON.stringify(payload);
    }
}

async function hydrateDirectMessage(message) {
    const text = message.payload ? await decodePayload(message.payload) : "";
    return { ...message, text };
}

async function hydrateGroupMessage(message) {
    const text = message.payload ? await decodePayload(message.payload) : "";
    return { ...message, text };
}

function previewText(item) {
    if (!item) {
        return "No messages yet";
    }
    if (item.text) {
        return item.text.slice(0, 48);
    }
    return (item.kind || "text").toUpperCase();
}

function renderNotifications() {
    const unreadCount = state.notifications.filter((item) => !item.is_read).length;
    elements.notificationCount.textContent = String(unreadCount);
    if (!state.notifications.length) {
        elements.notificationList.textContent = "No notifications yet.";
        elements.notificationList.classList.add("empty-copy");
        return;
    }
    elements.notificationList.classList.remove("empty-copy");
    elements.notificationList.innerHTML = state.notifications.map((notification) => `
        <article class="notification-item ${notification.is_read ? "" : "active"}" data-notification="${notification.id}">
            <div class="notification-row">
                <strong>${notification.title}</strong>
                <span class="classic-badge">${notification.is_read ? "Read" : "New"}</span>
            </div>
            <div>${notification.body}</div>
            <small>${formatDateTime(notification.created_at)}</small>
        </article>
    `).join("");
}

function renderRequests() {
    elements.requestCount.textContent = String(state.incomingRequests.length);
    if (!state.incomingRequests.length) {
        elements.incomingRequests.textContent = "No incoming requests.";
        elements.incomingRequests.classList.add("empty-copy");
        return;
    }
    elements.incomingRequests.classList.remove("empty-copy");
    elements.incomingRequests.innerHTML = state.incomingRequests.map((request) => `
        <article class="request-item">
            <div class="request-line">
                <div>
                    <strong>${request.friend.username}</strong>
                    <div>${request.friend.phone_number}</div>
                </div>
                <div class="request-actions">
                    <button class="primary-button compact-button" data-accept="${request.id}">Accept</button>
                    <button class="secondary-button compact-button" data-reject="${request.id}">Reject</button>
                </div>
            </div>
        </article>
    `).join("");
}

function relationshipLabel(entry) {
    const relationship = entry.relationship;
    if (!relationship) {
        return "Add Friend";
    }
    if (relationship.status === "accepted") {
        return "Friends";
    }
    if (relationship.direction === "incoming") {
        return "Pending You";
    }
    return "Pending";
}

function renderDirectory() {
    elements.directoryCount.textContent = String(state.directory.length);
    if (!state.directory.length) {
        elements.directoryList.textContent = "No users available yet.";
        elements.directoryList.classList.add("empty-copy");
        elements.groupMemberPicker.textContent = "Choose users from directory.";
        return;
    }
    elements.directoryList.classList.remove("empty-copy");
    elements.directoryList.innerHTML = state.directory.map((entry) => `
        <article class="user-card">
            <div class="user-row">
                <div>
                    <strong>${entry.user.username}</strong>
                    <div>${entry.user.phone_number}</div>
                </div>
                <button class="secondary-button compact-button" data-directory-add="${entry.user.phone_number}" ${relationshipLabel(entry) !== "Add Friend" ? "disabled" : ""}>${relationshipLabel(entry)}</button>
            </div>
        </article>
    `).join("");

    elements.groupMemberPicker.classList.remove("empty-copy");
    elements.groupMemberPicker.innerHTML = state.directory.map((entry) => `
        <label class="member-row">
            <span>${entry.user.username}</span>
            <input type="checkbox" value="${entry.user.id}" class="group-member-checkbox">
        </label>
    `).join("");
}

function renderConversations() {
    elements.friendCount.textContent = String(state.conversations.length);
    if (!state.conversations.length) {
        elements.conversationList.textContent = "Add a friend to start chatting.";
        elements.conversationList.classList.add("empty-copy");
        return;
    }
    elements.conversationList.classList.remove("empty-copy");
    elements.conversationList.innerHTML = state.conversations.map((conversation) => `
        <article class="chat-item ${state.activeChat?.type === "direct" && state.activeChat.id === conversation.friend.id ? "active" : ""}" data-direct="${conversation.friend.id}">
            <div class="chat-row">
                <div>
                    <strong>${conversation.friend.username}</strong>
                    <div>${previewText(conversation.last_message)}</div>
                </div>
                <span class="classic-badge">${conversation.unread_count || 0}</span>
            </div>
        </article>
    `).join("");
}

function renderGroups() {
    elements.groupCount.textContent = String(state.groups.length);
    if (!state.groups.length) {
        elements.groupList.textContent = "No groups yet.";
        elements.groupList.classList.add("empty-copy");
        return;
    }
    elements.groupList.classList.remove("empty-copy");
    elements.groupList.innerHTML = state.groups.map((group) => `
        <article class="group-item ${state.activeChat?.type === "group" && state.activeChat.id === group.id ? "active" : ""}" data-group="${group.id}">
            <div class="chat-row">
                <div>
                    <strong>${group.name}</strong>
                    <div>${previewText(group.last_message)}</div>
                </div>
                <span class="classic-badge">${group.members?.length || 0}</span>
            </div>
        </article>
    `).join("");
}

function renderGallery() {
    if (!state.gallery.length) {
        elements.galleryGrid.textContent = "Media from the active chat will appear here.";
        elements.galleryGrid.classList.add("empty-copy");
        return;
    }
    elements.galleryGrid.classList.remove("empty-copy");
    elements.galleryGrid.innerHTML = state.gallery.map((item) => {
        if (!item.media) {
            return "";
        }
        if (item.media.media_type === "video") {
            return `<article class="gallery-item"><video controls preload="metadata" src="${item.media.preview_url}"></video></article>`;
        }
        if (item.media.media_type === "audio") {
            return `<article class="gallery-item"><audio controls src="${item.media.preview_url}"></audio></article>`;
        }
        return `<article class="gallery-item"><img src="${item.media.preview_url}" alt="${item.media.file_name}"></article>`;
    }).join("");
}

function renderMessageStream(messages) {
    if (!messages.length) {
        elements.messageStream.innerHTML = `
            <div class="empty-state">
                <h3>No messages yet</h3>
                <p>Send the first message to start this chat.</p>
            </div>
        `;
        return;
    }
    elements.messageStream.innerHTML = messages.map((message) => {
        const directMine = message.sender_id === state.session.user.id;
        const groupMine = message.sender?.id === state.session.user.id;
        const mine = directMine || groupMine;
        const senderLabel = state.activeChat?.type === "group"
            ? (mine ? "You" : message.sender.username)
            : (mine ? "You" : activeDirectFriend()?.username || "Friend");
        const seenText = state.activeChat?.type === "direct"
            ? (mine && message.is_seen ? "Seen" : mine ? "Sent" : "Incoming")
            : "Group";
        let mediaMarkup = "";
        if (message.media) {
            if (message.media.media_type === "video") {
                mediaMarkup = `<div class="message-media"><video controls preload="metadata" src="${message.media.preview_url}"></video></div>`;
            } else if (message.media.media_type === "audio") {
                mediaMarkup = `<div class="message-media"><audio controls src="${message.media.preview_url}"></audio></div>`;
            } else {
                mediaMarkup = `<div class="message-media"><img src="${message.media.preview_url}" alt="${message.media.file_name}"></div>`;
            }
            mediaMarkup += `<a class="download-link" href="${message.media.download_url}?download=1">Download</a>`;
        }
        return `
            <article class="message-card ${mine ? "mine" : ""}">
                <div class="message-meta">
                    <span>${senderLabel}</span>
                    <span>${formatTime(message.created_at)} | ${seenText}</span>
                </div>
                ${message.text ? `<div>${message.text}</div>` : ""}
                ${mediaMarkup}
            </article>
        `;
    }).join("");
    elements.messageStream.scrollTop = elements.messageStream.scrollHeight;
}

function updateActiveHeader() {
    if (!state.activeChat) {
        elements.activeChatType.textContent = "Classic Messenger";
        elements.activeChatName.textContent = "Choose a chat";
        elements.activeChatStatus.textContent = "Select a person or group to begin messaging.";
        elements.videoCallButton.disabled = true;
        return;
    }
    if (state.activeChat.type === "direct") {
        const friend = activeDirectFriend();
        elements.activeChatType.textContent = "Direct Chat";
        elements.activeChatName.textContent = friend?.username || "Direct Chat";
        elements.activeChatStatus.textContent = friend?.is_online ? "Online now" : `Last seen ${formatDateTime(friend?.last_seen)}`;
        elements.videoCallButton.disabled = false;
    } else {
        const group = activeGroup();
        elements.activeChatType.textContent = "Group Chat";
        elements.activeChatName.textContent = group?.name || "Group";
        elements.activeChatStatus.textContent = `${group?.members?.length || 0} members in this room.`;
        elements.videoCallButton.disabled = true;
    }
}

async function fetchNotifications() {
    const payload = await get("/api/notifications");
    state.notifications = payload.notifications;
    renderNotifications();
}

async function fetchRequests() {
    const payload = await get("/api/friends/requests");
    state.incomingRequests = payload.incoming;
    renderRequests();
}

async function fetchDirectory() {
    const payload = await get("/api/friends/directory");
    state.directory = payload.users;
    renderDirectory();
}

async function fetchConversations() {
    const payload = await get("/api/conversations");
    state.conversations = await Promise.all(payload.conversations.map(async (conversation) => ({
        ...conversation,
        last_message: conversation.last_message ? await hydrateDirectMessage(conversation.last_message) : null,
    })));
    renderConversations();
}

async function fetchGroups() {
    const payload = await get("/api/groups");
    state.groups = await Promise.all(payload.groups.map(async (group) => ({
        ...group,
        last_message: group.last_message ? await hydrateGroupMessage(group.last_message) : null,
    })));
    state.groups.forEach((group) => state.socket?.emit("group:subscribe", { group_id: group.id }));
    renderGroups();
}

async function fetchMessagesForActiveChat() {
    if (!state.activeChat) {
        state.gallery = [];
        renderGallery();
        renderMessageStream([]);
        return;
    }
    if (state.activeChat.type === "direct") {
        const payload = await get(`/api/messages/${state.activeChat.id}`);
        const messages = await Promise.all(payload.messages.map(hydrateDirectMessage));
        renderMessageStream(messages);
        await Promise.all(messages
            .filter((message) => message.recipient_id === state.session.user.id && !message.is_seen)
            .map((message) => markSeen(message.id)));
        const gallery = await get(`/api/gallery/${state.activeChat.id}`);
        state.gallery = await Promise.all(gallery.items.map(hydrateDirectMessage));
    } else {
        const payload = await get(`/api/groups/${state.activeChat.id}/messages`);
        const messages = await Promise.all(payload.messages.map(hydrateGroupMessage));
        renderMessageStream(messages);
        const gallery = await get(`/api/groups/${state.activeChat.id}/gallery`);
        state.gallery = await Promise.all(gallery.items.map(hydrateGroupMessage));
    }
    renderGallery();
}

async function selectDirectChat(friendId) {
    state.activeChat = { type: "direct", id: Number(friendId) };
    updateActiveHeader();
    renderConversations();
    renderGroups();
    await fetchMessagesForActiveChat();
}

async function selectGroupChat(groupId) {
    state.activeChat = { type: "group", id: groupId };
    updateActiveHeader();
    renderConversations();
    renderGroups();
    await fetchMessagesForActiveChat();
}

async function markSeen(messageId) {
    state.socket.emit("message_seen", { message_id: messageId });
}

async function sendCurrentMessage(kind = "text", media = null) {
    if (!state.activeChat) {
        showToast("Choose a direct chat or group first.");
        return;
    }
    const text = elements.messageInput.value.trim();
    if (!text && !media) {
        return;
    }
    if (state.activeChat.type === "direct") {
        const friend = activeDirectFriend();
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
    } else {
        state.socket.emit("send_group_message", {
            group_id: state.activeChat.id,
            kind,
            payload: text || "",
            media_id: media?.id || null,
        });
    }
    elements.messageInput.value = "";
}

async function uploadMedia(file, mediaTypeOverride = null) {
    const mediaType = mediaTypeOverride || (file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image");
    const metadata = await post("/api/media/upload-sessions", {
        filename: file.name,
        content_type: file.type || (mediaType === "audio" ? "audio/webm" : "application/octet-stream"),
        total_size: file.size,
        chunk_size: 5 * 1024 * 1024,
        media_type: mediaType,
    });

    let offset = 0;
    const chunkSize = metadata.chunk_size;
    while (offset < file.size) {
        const chunk = file.slice(offset, offset + chunkSize);
        const response = await fetch(`/api/media/upload-sessions/${metadata.upload_id}/chunk?offset=${offset}`, {
            method: "PUT",
            body: chunk,
            credentials: "same-origin",
        });
        if (!response.ok) {
            const payload = await response.json();
            throw new Error(payload.error || "Chunk upload failed.");
        }
        offset += chunk.size;
        elements.uploadProgress.textContent = `Uploading ${file.name}: ${Math.round((offset / file.size) * 100)}%`;
    }

    const payload = await post(`/api/media/upload-sessions/${metadata.upload_id}/complete`, {});
    elements.uploadProgress.textContent = `${file.name} uploaded.`;
    return payload.media;
}

async function startOrStopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
        state.mediaRecorder.stop();
        return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            state.recordedChunks.push(event.data);
        }
    };
    state.mediaRecorder.onstop = async () => {
        elements.recordingStatus.textContent = "Voice note captured. Uploading...";
        const blob = new Blob(state.recordedChunks, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        try {
            const media = await uploadMedia(file, "audio");
            await sendCurrentMessage("audio", media);
            await fetchMessagesForActiveChat();
        } catch (error) {
            showToast(error.message);
        }
        stream.getTracks().forEach((track) => track.stop());
        elements.recordingStatus.textContent = "";
        elements.recordVoiceButton.textContent = "Record Voice";
    };
    state.mediaRecorder.start();
    elements.recordingStatus.textContent = "Recording voice note... click again to stop.";
    elements.recordVoiceButton.textContent = "Stop Recording";
}

function createPeerConnection(targetUserId) {
    const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            state.socket.emit("call:ice-candidate", { recipient_id: targetUserId, candidate: event.candidate });
        }
    };
    peer.ontrack = (event) => {
        if (!state.call.remoteStream) {
            state.call.remoteStream = new MediaStream();
            elements.remoteVideo.srcObject = state.call.remoteStream;
        }
        state.call.remoteStream.addTrack(event.track);
    };
    return peer;
}

async function ensureLocalMedia() {
    if (state.call.localStream) {
        return state.call.localStream;
    }
    state.call.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    elements.localVideo.srcObject = state.call.localStream;
    elements.callPanel.classList.remove("hidden");
    return state.call.localStream;
}

async function startVideoCall() {
    const friend = activeDirectFriend();
    if (!friend) {
        showToast("Choose a direct chat first.");
        return;
    }
    const stream = await ensureLocalMedia();
    state.call.withUserId = friend.id;
    state.call.peer = createPeerConnection(friend.id);
    stream.getTracks().forEach((track) => state.call.peer.addTrack(track, stream));
    const offer = await state.call.peer.createOffer();
    await state.call.peer.setLocalDescription(offer);
    state.socket.emit("call:offer", { recipient_id: friend.id, offer, call_type: "video" });
    elements.callStatus.textContent = "Calling";
    elements.endCallButton.classList.remove("hidden");
}

function cleanupCall() {
    if (state.call.peer) {
        state.call.peer.close();
    }
    if (state.call.localStream) {
        state.call.localStream.getTracks().forEach((track) => track.stop());
    }
    state.call = { peer: null, localStream: null, remoteStream: null, withUserId: null };
    elements.localVideo.srcObject = null;
    elements.remoteVideo.srcObject = null;
    elements.callPanel.classList.add("hidden");
    elements.endCallButton.classList.add("hidden");
    elements.callStatus.textContent = "Idle";
}

function bindSocket() {
    state.socket = io();
    state.socket.on("message:new", async (message) => {
        if (state.activeChat?.type === "direct" && (message.counterpart_id === state.activeChat.id || message.sender_id === state.activeChat.id)) {
            await fetchMessagesForActiveChat();
        }
        await fetchConversations();
    });
    state.socket.on("group:message:new", async (message) => {
        if (state.activeChat?.type === "group" && message.group_id === state.activeChat.id) {
            await fetchMessagesForActiveChat();
        }
        await fetchGroups();
    });
    state.socket.on("typing", ({ from_user_id }) => {
        if (state.activeChat?.type === "direct" && from_user_id === state.activeChat.id) {
            elements.typingIndicator.textContent = `${activeDirectFriend()?.username || "Friend"} is typing...`;
            clearTimeout(bindSocket.typingTimeout);
            bindSocket.typingTimeout = setTimeout(() => { elements.typingIndicator.textContent = ""; }, 1800);
        }
    });
    state.socket.on("group:typing", ({ from_user_id, group_id }) => {
        if (state.activeChat?.type === "group" && group_id === state.activeChat.id) {
            const sender = state.directory.find((entry) => entry.user.id === from_user_id)?.user
                || activeGroup()?.members?.find((member) => member.user.id === from_user_id)?.user;
            elements.typingIndicator.textContent = `${sender?.username || "Member"} is typing...`;
            clearTimeout(bindSocket.groupTypingTimeout);
            bindSocket.groupTypingTimeout = setTimeout(() => { elements.typingIndicator.textContent = ""; }, 1800);
        }
    });
    state.socket.on("presence:update", ({ user_id, is_online, last_seen }) => {
        state.directory = state.directory.map((entry) => entry.user.id === user_id ? { ...entry, user: { ...entry.user, is_online, last_seen } } : entry);
        state.conversations = state.conversations.map((entry) => entry.friend.id === user_id ? { ...entry, friend: { ...entry.friend, is_online, last_seen } } : entry);
        renderDirectory();
        renderConversations();
        updateActiveHeader();
    });
    state.socket.on("message:seen", async () => {
        if (state.activeChat?.type === "direct") {
            await fetchMessagesForActiveChat();
        }
    });
    state.socket.on("screenshot:alert", ({ from_user_id, reason }) => {
        const friend = state.conversations.find((entry) => entry.friend.id === from_user_id)?.friend;
        showToast(`${friend?.username || "A friend"} triggered a ${reason} alert.`);
    });
    state.socket.on("notification:new", async (notification) => {
        state.notifications.unshift(notification);
        renderNotifications();
        maybeNotify(notification.title, notification.body);
        showToast(`${notification.title}: ${notification.body}`);
        if (["friend_request", "friend_accept"].includes(notification.kind)) {
            await Promise.all([fetchRequests(), fetchDirectory(), fetchConversations()]);
        }
        if (["group_message", "group_added"].includes(notification.kind)) {
            await fetchGroups();
        }
    });
    state.socket.on("call:offer", async ({ from_user_id, offer }) => {
        const friend = state.conversations.find((entry) => entry.friend.id === from_user_id)?.friend;
        const accepted = window.confirm(`${friend?.username || "A friend"} is calling you. Accept?`);
        if (!accepted) {
            state.socket.emit("call:end", { recipient_id: from_user_id, reason: "declined" });
            return;
        }
        const stream = await ensureLocalMedia();
        state.call.withUserId = from_user_id;
        state.call.peer = createPeerConnection(from_user_id);
        stream.getTracks().forEach((track) => state.call.peer.addTrack(track, stream));
        await state.call.peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await state.call.peer.createAnswer();
        await state.call.peer.setLocalDescription(answer);
        state.socket.emit("call:answer", { recipient_id: from_user_id, answer });
        elements.callStatus.textContent = "Connected";
        elements.endCallButton.classList.remove("hidden");
    });
    state.socket.on("call:answer", async ({ answer }) => {
        if (!state.call.peer) {
            return;
        }
        await state.call.peer.setRemoteDescription(new RTCSessionDescription(answer));
        elements.callStatus.textContent = "Connected";
    });
    state.socket.on("call:ice-candidate", async ({ candidate }) => {
        if (state.call.peer && candidate) {
            await state.call.peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    state.socket.on("call:end", ({ reason }) => {
        showToast(`Call ended: ${reason}`);
        cleanupCall();
    });
    state.socket.on("error_message", ({ error }) => {
        showToast(error || "Something went wrong.");
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
        state.privateKey = await unlockIdentity(state.session.encrypted_private_key, password, state.session.key_encryption_salt);
    } catch {
        showToast("Could not unlock your private key. Please log in again.");
        sessionStorage.removeItem("secret.unlock.password");
        window.location.href = "/login";
        return;
    }

    if (window.Notification && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
    }

    bindSocket();
    await Promise.all([fetchNotifications(), fetchRequests(), fetchDirectory(), fetchConversations(), fetchGroups()]);
    if (state.conversations[0]) {
        await selectDirectChat(state.conversations[0].friend.id);
    } else if (state.groups[0]) {
        await selectGroupChat(state.groups[0].id);
    } else {
        updateActiveHeader();
    }
}

elements.friendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
        await post("/api/friends/request", { phone_number: elements.friendPhone.value.trim() });
        elements.friendPhone.value = "";
        showToast("Friend request sent.");
        await Promise.all([fetchDirectory(), fetchRequests()]);
    } catch (error) {
        showToast(error.message);
    }
});

elements.directoryList.addEventListener("click", async (event) => {
    const phone = event.target.dataset.directoryAdd;
    if (!phone) {
        return;
    }
    try {
        await post("/api/friends/request", { phone_number: phone });
        showToast("Friend request sent.");
        await Promise.all([fetchDirectory(), fetchRequests()]);
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
        await Promise.all([fetchRequests(), fetchDirectory(), fetchConversations(), fetchNotifications()]);
    } catch (error) {
        showToast(error.message);
    }
});

elements.notificationList.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-notification]");
    if (!item) {
        return;
    }
    const notificationId = item.dataset.notification;
    try {
        await post(`/api/notifications/${notificationId}/read`, {});
        state.notifications = state.notifications.map((notification) => notification.id === notificationId ? { ...notification, is_read: true } : notification);
        renderNotifications();
    } catch (error) {
        showToast(error.message);
    }
});

elements.markAllRead.addEventListener("click", async () => {
    try {
        await post("/api/notifications/read-all", {});
        state.notifications = state.notifications.map((notification) => ({ ...notification, is_read: true }));
        renderNotifications();
    } catch (error) {
        showToast(error.message);
    }
});

elements.notificationButton.addEventListener("click", () => {
    elements.notificationList.classList.toggle("hidden");
});

elements.conversationList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-direct]");
    if (!card) {
        return;
    }
    await selectDirectChat(Number(card.dataset.direct));
});

elements.groupList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-group]");
    if (!card) {
        return;
    }
    await selectGroupChat(card.dataset.group);
});

elements.groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const memberIds = [...document.querySelectorAll(".group-member-checkbox:checked")].map((input) => Number(input.value));
    try {
        await post("/api/groups", { name: elements.groupName.value.trim(), member_ids: memberIds });
        elements.groupName.value = "";
        document.querySelectorAll(".group-member-checkbox").forEach((input) => { input.checked = false; });
        showToast("Group created.");
        await fetchGroups();
    } catch (error) {
        showToast(error.message);
    }
});

elements.sendButton.addEventListener("click", async () => {
    try {
        await sendCurrentMessage();
    } catch (error) {
        showToast(error.message);
    }
});

elements.messageInput.addEventListener("input", () => {
    if (!state.activeChat) {
        return;
    }
    if (state.activeChat.type === "direct") {
        state.socket?.emit("typing", { recipient_id: state.activeChat.id });
    } else {
        state.socket?.emit("group:typing", { group_id: state.activeChat.id });
    }
});

elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        elements.sendButton.click();
        return;
    }
    if (event.key === "PrintScreen" && state.activeChat?.type === "direct") {
        state.socket?.emit("screenshot_detected", { target_user_id: state.activeChat.id, reason: "printscreen" });
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.activeChat?.type === "direct") {
        state.socket?.emit("screenshot_detected", { target_user_id: state.activeChat.id, reason: "tab_hidden" });
    }
});

elements.mediaInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }
    try {
        const media = await uploadMedia(file);
        const kind = media.media_type === "audio" ? "audio" : media.media_type === "video" ? "video" : "image";
        await sendCurrentMessage(kind, media);
        await fetchMessagesForActiveChat();
        elements.mediaInput.value = "";
    } catch (error) {
        showToast(error.message);
        elements.uploadProgress.textContent = "";
    }
});

elements.recordVoiceButton.addEventListener("click", async () => {
    try {
        await startOrStopRecording();
    } catch (error) {
        showToast(error.message);
        elements.recordingStatus.textContent = "Microphone access failed.";
    }
});

elements.refreshGallery.addEventListener("click", async () => {
    await fetchMessagesForActiveChat();
});

elements.videoCallButton.addEventListener("click", async () => {
    try {
        await startVideoCall();
    } catch (error) {
        showToast(error.message);
    }
});

elements.endCallButton.addEventListener("click", () => {
    if (state.call.withUserId) {
        state.socket.emit("call:end", { recipient_id: state.call.withUserId, reason: "ended" });
    }
    cleanupCall();
});

elements.logoutButton.addEventListener("click", async () => {
    await post("/api/auth/logout", {});
    sessionStorage.removeItem("secret.unlock.password");
    window.location.href = "/login";
});

boot();
