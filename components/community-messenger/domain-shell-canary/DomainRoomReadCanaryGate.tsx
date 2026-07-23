"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isClientBundleKilled,
  isDomainShellReadUiCanaryViewer,
  requestServerBundleKill,
  type ClientDomainReadBundle,
} from "@/components/community-messenger/domain-shell-canary/canary-allowlist";
import {
  DomainRoomReadCanaryProvider,
  type DomainRoomCanaryHeader,
  type DomainRoomPresentation,
} from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import {
  getRoomEntryIntent,
  markRoomEntryIntent,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import {
  composeDomainRoomHeaderChrome,
  type DomainRoomHeaderChrome,
} from "@/lib/messenger/contracts/domain-room-header-chrome";
import type { DomainRoomHeaderChrome as ClientChrome } from "@/components/community-messenger/domain-shell-canary/domain-room-header-chrome-client";

type RoomDto = {
  authority: "domain_room_presentation_canary";
  viewerUserId: string;
  roomId: string;
  chatDomain: "general_direct" | "group" | "trade" | "store_order";
  domainIdentityKey: string;
  bundle: ClientDomainReadBundle;
  chrome?: DomainRoomHeaderChrome;
  header:
    | {
        kind: "general_peer";
        title: string;
        avatarUrl: string | null;
      }
    | {
        kind: "group";
        groupName: string;
        groupImageUrl: string | null;
        memberCount: number;
      }
      | {
        kind: "trade";
        peerLabel: string | null;
        peerAvatarUrl?: string | null;
        productTitle: string;
        productImageUrl: string | null;
        itemId?: string | null;
        productChatId?: string | null;
      }
    | {
        kind: "buyer_store";
        storeName: string;
        storeImageUrl: string | null;
        orderId?: string | null;
        orderStatusLabel?: string | null;
      }
    | {
        kind: "owner_buyer_peer";
        customerName: string;
        customerAvatarUrl: string | null;
        orderId?: string | null;
        orderStatusLabel?: string | null;
      };
};

function toHeader(dto: RoomDto): DomainRoomCanaryHeader | null {
  const h = dto.header;
  if (h.kind === "general_peer") {
    return {
      kind: "general_peer",
      title: h.title,
      avatarUrl: h.avatarUrl,
      chatDomain: "general_direct",
      domainIdentityKey: dto.domainIdentityKey,
    };
  }
  if (h.kind === "group") {
    return {
      kind: "group",
      title: h.groupName,
      avatarUrl: h.groupImageUrl,
      memberCount: h.memberCount,
      chatDomain: "group",
      domainIdentityKey: dto.domainIdentityKey,
    };
  }
  if (h.kind === "trade") {
    const peerTitle = h.peerLabel?.trim() || "";
    if (!peerTitle) return null;
    return {
      kind: "trade",
      title: peerTitle,
      avatarUrl: h.peerAvatarUrl?.trim() || null,
      peerLabel: peerTitle,
      productTitle: h.productTitle?.trim() || "",
      productImageUrl: h.productImageUrl?.trim() || null,
      itemId: h.itemId?.trim() || null,
      productChatId: h.productChatId?.trim() || null,
      chatDomain: "trade",
      domainIdentityKey: dto.domainIdentityKey,
    };
  }
  if (h.kind === "buyer_store") {
    if (h.storeName.trim().startsWith("@")) return null;
    return {
      kind: "buyer_store",
      title: h.storeName,
      avatarUrl: h.storeImageUrl,
      orderId: h.orderId?.trim() || null,
      orderStatusLabel: h.orderStatusLabel?.trim() || null,
      chatDomain: "store_order",
      domainIdentityKey: dto.domainIdentityKey,
    };
  }
  if (h.kind === "owner_buyer_peer") {
    return {
      kind: "owner_buyer_peer",
      title: h.customerName,
      avatarUrl: h.customerAvatarUrl,
      orderId: h.orderId?.trim() || null,
      orderStatusLabel: h.orderStatusLabel?.trim() || null,
      chatDomain: "store_order",
      domainIdentityKey: dto.domainIdentityKey,
    };
  }
  return null;
}

/** Prefer server chrome; rebuild from header kind only if absent (never roomType reinference). */
function toChrome(dto: RoomDto, header: DomainRoomCanaryHeader): ClientChrome {
  if (dto.chrome && typeof dto.chrome.roomTypeLabelKey === "string") {
    return dto.chrome as ClientChrome;
  }
  if (header.kind === "general_peer") return composeDomainRoomHeaderChrome({ kind: "general_peer" });
  if (header.kind === "group") {
    return composeDomainRoomHeaderChrome({
      kind: "group",
      memberCount: header.memberCount,
    });
  }
  if (header.kind === "trade") {
    return composeDomainRoomHeaderChrome({
      kind: "trade",
      peerLabel: header.peerLabel,
      productTitle: header.productTitle,
    });
  }
  if (header.kind === "buyer_store") {
    return composeDomainRoomHeaderChrome({
      kind: "buyer_store",
      orderId: header.orderId,
      orderStatusLabel: header.orderStatusLabel,
    });
  }
  return composeDomainRoomHeaderChrome({
    kind: "owner_buyer_peer",
    orderId: header.orderId,
    orderStatusLabel: header.orderStatusLabel,
  });
}

/**
 * Instrumentation — silent Legacy fallback reasons (freq audit).
 * Grep prod: `[domain-room-canary] legacy_fallback`
 */
export type DomainRoomLegacyFallbackReason =
  | "no_supabase"
  | "not_allowlisted"
  | "http_nok"
  | "viewer_mismatch"
  | "identity_mismatch"
  | "bundle_killed"
  | "header_map_fail"
  | "runtime_exception";

/** Phase 4 observability — pair with legacy_fallback; grep prod `[domain-room-canary]`. */
function logDomainRoomPresentationStarted(roomId: string): void {
  console.info("[domain-room-canary] domain_presentation_started", {
    roomIdPrefix: roomId.slice(0, 8),
    at: Date.now(),
  });
}

function logDomainRoomPresentationResolved(input: {
  roomId: string;
  outcome: "domain" | "legacy";
  headerKind?: string | null;
}): void {
  console.info("[domain-room-canary] domain_presentation_resolved", {
    roomIdPrefix: input.roomId.slice(0, 8),
    outcome: input.outcome,
    headerKind: input.headerKind ?? null,
    at: Date.now(),
  });
}

function logDomainRoomLegacyFallback(input: {
  reason: DomainRoomLegacyFallbackReason;
  roomId: string;
  httpStatus?: number | null;
  serverTrigger?: string | null;
  serverCode?: string | null;
  detail?: string | null;
}): void {
  console.info("[domain-room-canary] legacy_fallback", {
    reason: input.reason,
    roomIdPrefix: input.roomId.slice(0, 8),
    httpStatus: input.httpStatus ?? null,
    serverTrigger: input.serverTrigger ?? null,
    serverCode: input.serverCode ?? null,
    detail: input.detail ?? null,
  });
}

/**
 * Phase 3 room-entry waterfall fix: children (BootstrapGate → RoomClient) now mount
 * immediately and unconditionally — this gate no longer blocks first paint while its own
 * `/api/messenger/domain-read/room` fetch is in flight. Identity verification (viewer/domain/
 * bundle-kill checks below) is unchanged; only the *rendering* is decoupled from it. Presentation
 * upgrades the header in place via context once verified — the wrapping element and Provider are
 * always present (same tree shape in every mode) specifically so resolving Domain presentation
 * does not remount `children` (BootstrapGate/RoomClient keep their own mount/state throughout).
 * Before verification, context value is `null` — identical to today's existing Legacy fallback,
 * so no unverified peer/group/store/product identity is ever exposed through this gate.
 */
export function DomainRoomReadCanaryGate({
  roomId,
  children,
}: {
  roomId: string;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"loading" | "domain" | "legacy">("loading");
  const [presentation, setPresentation] = useState<DomainRoomPresentation | null>(null);
  const rid = roomId.trim();

  // Room 전환 시 이전 room presentation을 자식에 넘기지 않음 — BootstrapGate가
  // roomId mismatch로 Legacy 진입하며 timeline marker가 간헐 누락되는 레이스를 막는다.
  useLayoutEffect(() => {
    setMode("loading");
    setPresentation(null);
  }, [rid]);

  useEffect(() => {
    let cancelled = false;
    logDomainRoomPresentationStarted(rid);
    (async () => {
      const goLegacy = (
        reason: DomainRoomLegacyFallbackReason,
        extra?: {
          httpStatus?: number | null;
          serverTrigger?: string | null;
          serverCode?: string | null;
          detail?: string | null;
        }
      ) => {
        if (cancelled) return;
        logDomainRoomLegacyFallback({
          reason,
          roomId: rid,
          httpStatus: extra?.httpStatus,
          serverTrigger: extra?.serverTrigger,
          serverCode: extra?.serverCode,
          detail: extra?.detail,
        });
        logDomainRoomPresentationResolved({ roomId: rid, outcome: "legacy" });
        setMode("legacy");
      };

      try {
        const sb = getSupabaseClient();
        if (!sb) {
          goLegacy("no_supabase");
          return;
        }
        const { data } = await sb.auth.getUser();
        const uid = data.user?.id?.trim() ?? null;
        if (!isDomainShellReadUiCanaryViewer(uid)) {
          goLegacy("not_allowlisted");
          return;
        }

        const res = await fetch(
          `/api/messenger/domain-read/room?roomId=${encodeURIComponent(rid)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          // Out-of-scope / not in snapshot / owner → Legacy room (no full-home kill)
          let serverTrigger: string | null = null;
          let serverCode: string | null = null;
          try {
            const errBody = (await res.json()) as {
              trigger?: string;
              code?: string;
              error?: string;
            };
            serverTrigger = errBody.trigger?.trim() || null;
            serverCode = (errBody.code ?? errBody.error)?.trim() || null;
          } catch {
            /* non-JSON body */
          }
          const reason: DomainRoomLegacyFallbackReason =
            serverCode === "dibay_domain_read_not_eligible"
              ? "not_allowlisted"
              : serverCode === "dibay_domain_read_bundle_killed"
                ? "bundle_killed"
                : "http_nok";
          goLegacy(reason, {
            httpStatus: res.status,
            serverTrigger,
            serverCode,
          });
          return;
        }
        const body = (await res.json()) as RoomDto;
        if (body.viewerUserId !== uid || body.roomId !== rid) {
          if (body.bundle) await requestServerBundleKill(body.bundle);
          goLegacy("viewer_mismatch", {
            detail: body.viewerUserId !== uid ? "viewer_user_id" : "room_id",
          });
          return;
        }
        // Domain entry intent — list/hub에서 넘긴 expectedDomain/identity와 불일치하면 Domain 거부
        const entry = getRoomEntryIntent(rid);
        const expectedDomain = entry?.seed?.expectedDomain;
        const expectedIdentity = entry?.seed?.expectedIdentityKey?.trim();
        if (expectedDomain && expectedDomain !== body.chatDomain) {
          if (body.bundle) await requestServerBundleKill(body.bundle);
          goLegacy("identity_mismatch", { detail: "expected_domain" });
          return;
        }
        if (expectedIdentity && expectedIdentity !== body.domainIdentityKey) {
          if (body.bundle) await requestServerBundleKill(body.bundle);
          goLegacy("identity_mismatch", { detail: "expected_identity_key" });
          return;
        }
        if (isClientBundleKilled(body.bundle)) {
          goLegacy("bundle_killed", { detail: body.bundle });
          return;
        }
        const mapped = toHeader(body);
        if (!mapped) {
          await requestServerBundleKill(body.bundle);
          goLegacy("header_map_fail", { detail: body.header?.kind ?? null });
          return;
        }
        // Deep link 포함: 서버 DTO로 Domain entry seed 확정 (BootstrapGate expected 권한)
        markRoomEntryIntent(rid, {
          title: mapped.title,
          avatarUrl: mapped.avatarUrl,
          expectedDomain: body.chatDomain,
          expectedIdentityKey: body.domainIdentityKey,
        });
        if (cancelled) return;
        setPresentation({
          authority: "domain_room_presentation_canary",
          roomId: rid,
          chatDomain: mapped.chatDomain,
          domainIdentityKey: mapped.domainIdentityKey,
          header: mapped,
          chrome: toChrome(body, mapped),
        });
        logDomainRoomPresentationResolved({ roomId: rid, outcome: "domain", headerKind: mapped.kind });
        setMode("domain");
      } catch {
        goLegacy("runtime_exception");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rid]);

  const domainReady = mode === "domain" && presentation != null && presentation.roomId === rid;

  return (
    <DomainRoomReadCanaryProvider presentation={domainReady ? presentation : null}>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-domain-room-authority={domainReady ? "domain" : mode}
        data-domain-room-canary={domainReady ? presentation.header.kind : undefined}
        data-domain-room-header={domainReady ? presentation.header.kind : undefined}
        data-domain-room-domain={domainReady ? presentation.chatDomain : undefined}
        data-domain-identity-key={domainReady ? presentation.domainIdentityKey : undefined}
      >
        {children}
      </div>
    </DomainRoomReadCanaryProvider>
  );
}
