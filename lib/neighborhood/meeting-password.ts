import { createHash } from "node:crypto";

function normalizeMeetingPassword(password: string) {
  return password.trim();
}

export function hashMeetingPassword(password: string) {
  const normalized = normalizeMeetingPassword(password);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function verifyMeetingPassword(password: string, passwordHash: string | null | undefined) {
  const normalizedHash = String(passwordHash ?? "").trim();
  if (!normalizedHash) return false;
  return hashMeetingPassword(password) === normalizedHash;
}

