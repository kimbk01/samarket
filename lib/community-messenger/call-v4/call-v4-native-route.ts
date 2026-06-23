"use client";

export function normalizeCallV4AppPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
}

export function readCallV4SessionIdFromNativeRoute(path: string): string | null {
  const trimmed = normalizeCallV4AppPath(path);
  const match = trimmed.match(/^\/community-messenger\/calls-v4\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

export function isCallV4CalleeAcceptRoute(path: string): boolean {
  const trimmed = normalizeCallV4AppPath(path);
  return trimmed.startsWith("/community-messenger/calls-v4/") && trimmed.includes("action=accept");
}

export function isCallV4CalleeRejectRoute(path: string): boolean {
  const trimmed = normalizeCallV4AppPath(path);
  return trimmed.startsWith("/community-messenger/calls-v4/") && trimmed.includes("action=reject");
}

export function isCallV4CallRoute(path: string): boolean {
  return normalizeCallV4AppPath(path).startsWith("/community-messenger/calls-v4/");
}
