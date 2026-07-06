import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const iterations = 100_000;
const keyLength = 64;
const digest = "sha512";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [iterationText, salt, originalHash] = storedHash.split(":");
  const parsedIterations = Number(iterationText);

  if (!parsedIterations || !salt || !originalHash) {
    return false;
  }

  const hash = pbkdf2Sync(password, salt, parsedIterations, keyLength, digest);
  const original = Buffer.from(originalHash, "hex");

  return original.length === hash.length && timingSafeEqual(original, hash);
}
