"use client";

import { useEffect } from "react";
import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";

type Props = { canonicalRoomId: string };

function mergeDiagnostics(
  base: CommunityMessengerRoomSnapshotDiagnostics,
  patch: CommunityMessengerRoomSnapshotDiagnostics
): CommunityMessengerRoomSnapshotDiagnostics {
  const bLoad = base.chatRoomDetailLoad ?? {};
  const pLoad = patch.chatRoomDetailLoad ?? {};
  return {
    ...base,
    ...patch,
    chatRoomDetailLoad: { ...bLoad, ...pLoad },
  };
}

/**
 * E2E: RSC가보낸 `#samarket-room-snapshot-diag` 에 trade `chatRoomDetailLoad` 만 비동기로 합류시킨다.
 */
export function MessengerRoomE2eSnapshotDiagTradeOverlay({ canonicalRoomId }: Props) {
  useEffect(() => {
    const id = String(canonicalRoomId ?? "").trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const el = document.getElementById("samarket-room-snapshot-diag");
      if (!el) return;
      const path = `/api/community-messenger/rooms/${encodeURIComponent(id)}/e2e-room-snapshot-diag`;
      const res = await fetch(path, { credentials: "include", cache: "no-store" });
      if (!res.ok || cancelled) return;
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        tradeDiagnostics?: CommunityMessengerRoomSnapshotDiagnostics;
      } | null;
      if (!body?.ok || !body.tradeDiagnostics || cancelled) return;
      let base: CommunityMessengerRoomSnapshotDiagnostics = {};
      const raw =
        el.textContent?.trim() || (el instanceof HTMLScriptElement ? el.innerHTML?.trim() : "") || "";
      if (raw) {
        try {
          base = JSON.parse(raw) as CommunityMessengerRoomSnapshotDiagnostics;
        } catch {
          base = {};
        }
      }
      const merged = mergeDiagnostics(base, body.tradeDiagnostics);
      const html = JSON.stringify(merged);
      if (el instanceof HTMLScriptElement) {
        el.innerHTML = html;
      } else {
        el.textContent = html;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canonicalRoomId]);

  return null;
}
