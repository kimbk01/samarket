import { createHash } from "node:crypto";

/** 메신저 오픈그룹(`community_messenger_rooms.password_hash`) 입장 비밀번호 — sha256(trim). */

function normalizeOpenGroupPassword(password: string) {
  return password.trim();
}

export function hashOpenGroupPassword(password: string) {
  const normalized = normalizeOpenGroupPassword(password);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function verifyOpenGroupPassword(password: string, passwordHash: string | null | undefined) {
  const normalizedHash = String(passwordHash ?? "").trim();
  if (!normalizedHash) return false;
  return hashOpenGroupPassword(password) === normalizedHash;
}

