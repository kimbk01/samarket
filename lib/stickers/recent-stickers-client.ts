"use client";

const KEY = "samarket:messenger:sticker-recent";
const MAX = 16;

export function readRecentStickerUrls(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.startsWith("/stickers/")).slice(0, MAX);
  } catch {
    return [];
  }
}

export function touchRecentStickerUrl(fileUrl: string): void {
  if (typeof window === "undefined") return;
  const u = fileUrl.trim();
  if (!u.startsWith("/stickers/")) return;
  try {
    const prev = readRecentStickerUrls().filter((x) => x !== u);
    const next = [u, ...prev].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
