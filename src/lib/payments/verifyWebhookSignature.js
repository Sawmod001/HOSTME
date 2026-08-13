import crypto from "crypto";

export function verifyPaystackSignature(rawBody, signatureHeader, webhookSecret) {
  const expected = crypto.createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signatureHeader || "", "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
