async function request(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        credentials: "same-origin",
        ...options,
    });

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : null;
    if (!response.ok) {
        const message = payload?.error || payload?.message || "Request failed.";
        throw new Error(message);
    }
    return payload;
}

export function get(url) {
    return request(url, { method: "GET" });
}

export function post(url, body) {
    return request(url, { method: "POST", body: JSON.stringify(body) });
}

export function put(url, body, headers = {}) {
    return request(url, { method: "PUT", body, headers });
}
