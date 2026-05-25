import { normalizeCmRealtimeSubscribeRoomId } from "@/lib/community-messenger/realtime/cm-rt-room-sub-log";

export function roomIdsFromFingerprint(fingerprint: string | null | undefined): string[] {
  const raw = fingerprint ?? "";
  if (!raw) return [];
  return [...new Set(raw.split("\0").map((id) => normalizeCmRealtimeSubscribeRoomId(id)).filter(Boolean))].sort();
}

export function diffRoomIdFingerprints(
  prevFingerprint: string | null | undefined,
  nextFingerprint: string | null | undefined
): { prev: string[]; next: string[]; added: string[]; removed: string[] } {
  const prev = roomIdsFromFingerprint(prevFingerprint);
  const next = roomIdsFromFingerprint(nextFingerprint);
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    prev,
    next,
    added: next.filter((id) => !prevSet.has(id)),
    removed: prev.filter((id) => !nextSet.has(id)),
  };
}

export function roomFingerprintsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return roomIdsFromFingerprint(a).join("\0") === roomIdsFromFingerprint(b).join("\0");
}
