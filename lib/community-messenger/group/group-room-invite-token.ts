import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 16;

export function generateGroupInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function normalizeGroupInviteToken(value: unknown): string | null {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token || token.length < 8 || token.length > 128) return null;
  return token;
}

export function buildGroupInviteWebPath(token: string): string {
  return `/group/${encodeURIComponent(token)}`;
}

export function buildGroupInviteAbsoluteUrl(token: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${buildGroupInviteWebPath(token)}`;
}
