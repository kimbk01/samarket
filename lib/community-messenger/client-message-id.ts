"use client";

export function createCommunityMessengerClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }
  // fallback: non-crypto unique-ish id for older envs
  const r = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `cm_${t}_${r}`;
}

