const encoder = new TextEncoder();
const decoder = new TextDecoder();

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function base64ToArrayBuffer(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
}

function arrayBufferToPem(buffer, label) {
    const body = arrayBufferToBase64(buffer).match(/.{1,64}/g)?.join("\n") || "";
    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

function pemToArrayBuffer(pem) {
    const body = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
    return base64ToArrayBuffer(body);
}

async function deriveWrappingKey(password, salt) {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 210000,
            hash: "SHA-256",
        },
        baseKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt"],
    );
}

export async function generateIdentity(password) {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"],
    );

    const publicSpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privatePkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrappingKey = await deriveWrappingKey(password, salt);
    const encryptedPrivateKey = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        wrappingKey,
        privatePkcs8,
    );

    return {
        publicKey: arrayBufferToPem(publicSpki, "PUBLIC KEY"),
        encryptedPrivateKey: JSON.stringify({
            iv: arrayBufferToBase64(iv.buffer),
            data: arrayBufferToBase64(encryptedPrivateKey),
        }),
        keyEncryptionSalt: arrayBufferToBase64(salt.buffer),
        privateKey: keyPair.privateKey,
    };
}

export async function unlockIdentity(encryptedPrivateKeyJson, password, keySalt) {
    const payload = JSON.parse(encryptedPrivateKeyJson);
    const salt = new Uint8Array(base64ToArrayBuffer(keySalt));
    const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
    const wrappingKey = await deriveWrappingKey(password, salt);
    const decryptedPrivateKey = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        wrappingKey,
        base64ToArrayBuffer(payload.data),
    );
    return crypto.subtle.importKey(
        "pkcs8",
        decryptedPrivateKey,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"],
    );
}

export async function importPublicKey(publicKeyPem) {
    return crypto.subtle.importKey(
        "spki",
        pemToArrayBuffer(publicKeyPem),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"],
    );
}

export async function encryptForPublicKey(publicKeyPem, plaintext) {
    const publicKey = await importPublicKey(publicKeyPem);
    const sessionKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
    );
    const rawSessionKey = await crypto.subtle.exportKey("raw", sessionKey);
    const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawSessionKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sessionKey,
        encoder.encode(plaintext),
    );
    return JSON.stringify({
        wrappedKey: arrayBufferToBase64(wrappedKey),
        iv: arrayBufferToBase64(iv.buffer),
        data: arrayBufferToBase64(ciphertext),
    });
}

export async function decryptPayload(privateKey, payload) {
    if (!payload) {
        return "";
    }
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    const rawSessionKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        base64ToArrayBuffer(parsed.wrappedKey),
    );
    const sessionKey = await crypto.subtle.importKey(
        "raw",
        rawSessionKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(parsed.iv)) },
        sessionKey,
        base64ToArrayBuffer(parsed.data),
    );
    return decoder.decode(plaintext);
}
