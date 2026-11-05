import { createHmac, createPrivateKey, createPublicKey } from "node:crypto";

const SIGNING_CONTEXT = "daviplata-admin-telegram-ed25519-v1";
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function deriveDaviAuditKeys(sessionSecret: string) {
  const seed = createHmac("sha256", sessionSecret).update(SIGNING_CONTEXT).digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .toString("base64");
  return { privateKey, publicKey };
}
