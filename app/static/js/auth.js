import { post } from "./api.js";
import { generateIdentity } from "./crypto.js";

const tabButtons = [...document.querySelectorAll(".tab-button")];
const forms = {
    login: document.getElementById("login-form"),
    register: document.getElementById("register-form"),
};
const alertBox = document.getElementById("auth-alert");
const developerInfoButton = document.getElementById("developer-info-button");
const developerModal = document.getElementById("developer-modal");
const developerModalClose = document.getElementById("developer-modal-close");

function showAlert(message, type = "error") {
    alertBox.textContent = message;
    alertBox.className = `alert ${type}`;
}

function switchTab(tabName) {
    tabButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tabName);
    });
    Object.entries(forms).forEach(([name, form]) => {
        form.classList.toggle("active", name === tabName);
    });
    alertBox.className = "alert hidden";
}

function openDeveloperModal() {
    developerModal.classList.remove("hidden");
    developerModal.setAttribute("aria-hidden", "false");
}

function closeDeveloperModal() {
    developerModal.classList.add("hidden");
    developerModal.setAttribute("aria-hidden", "true");
}

tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
});

developerInfoButton?.addEventListener("click", openDeveloperModal);
developerModalClose?.addEventListener("click", closeDeveloperModal);
developerModal?.addEventListener("click", (event) => {
    if (event.target === developerModal) {
        closeDeveloperModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && developerModal && !developerModal.classList.contains("hidden")) {
        closeDeveloperModal();
    }
});

forms.login.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(forms.login);
    const phoneNumber = formData.get("phone_number");
    const password = formData.get("password");

    try {
        const payload = await post("/api/auth/login", {
            phone_number: phoneNumber,
            password,
        });
        sessionStorage.setItem("secret.unlock.password", password);
        window.location.href = payload.redirect_url;
    } catch (error) {
        showAlert(error.message);
    }
});

forms.register.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(forms.register);
    const phoneNumber = formData.get("phone_number");
    const username = formData.get("username");
    const password = formData.get("password");

    try {
        const identity = await generateIdentity(password);
        await post("/api/auth/register", {
            phone_number: phoneNumber,
            username,
            password,
            public_key: identity.publicKey,
            encrypted_private_key: identity.encryptedPrivateKey,
            key_encryption_salt: identity.keyEncryptionSalt,
        });
        sessionStorage.setItem("secret.unlock.password", password);
        showAlert("Account created. Logging you in...", "success");
        const loginPayload = await post("/api/auth/login", {
            phone_number: phoneNumber,
            password,
        });
        window.location.href = loginPayload.redirect_url;
    } catch (error) {
        showAlert(error.message);
    }
});
