import crypto from "crypto";

export function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== "string") {
        return false;
    }

    const [salt, derived] = storedHash.split(":", 2);
    if (!salt || !derived) {
        return false;
    }

    const candidate = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(derived));
}

export function createOtpCode(length = 6) {
    const digits = "0123456789";
    return Array.from({ length }, () => digits[Math.floor(Math.random() * digits.length)]).join("");
}

export function isOtpExpired(expiresAt) {
    if (!expiresAt) {
        return true;
    }

    return new Date(expiresAt).getTime() < Date.now();
}
