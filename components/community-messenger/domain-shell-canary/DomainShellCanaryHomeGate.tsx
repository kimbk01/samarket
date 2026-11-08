"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import {
  isClientBundleKilled,
  isDomainShellReadUiCanaryViewer,
  requestServerBundleKill,
} from "@/components/community-messenger/domain-shell-canary/canary-allowlist";
import {
  DomainCanaryShellRow,
  formatDomainCanaryTime,
} from "@/components/community-messenger/domain-shell-canary/DomainCanaryShellRow";
import { markRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { resolveRoomListBadgeCount } from "@/lib/community-messenger/read/room-list-badge";
import {
  getRoomMissedCallBadgeByRoomSnapshot,
  publishRoomMissedCallBadgeByRoom,
  subscribeRoomMissedCallBadge,
} from "@/lib/notifications/client/room-missed-call-badge-store";
import { translateBy } from "@/lib/i18n/translate-by";

type ShellInboxRow = {
  domain: "general_direct" | "group";
  roomId: string;
  domainIdentityKey: string;
  title: string;
  avatarUrl: string | null;
  previewText: string;
  lastMessageAt: string;
  unreadCount: number;
  href: string;
};

type ShellHomeDto = {
  authority: "domain_shell_read_ui_canary";
  viewerUserId: string;
  producedAt: string;
  inbox: ShellInboxRow[];
  tradeHub: {
    domain: "trade";
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    latestActivityAt: string | null;
    previewText: string;
    href: string;
  };
  storeOrderHub: {
    domain: "store_order";
    roomCount: number;
    unreadRoomCount: number;
    latestRoomId: string | null;
    latestActivityAt: string | null;
    previewText: string;
    href: string;
    exposesMemberIdentity: false;
  };
  counts: { generalDirect: number; group: number };
  writers: {
    cache: boolean;
    realtime: boolean;
    badge: boolean;
    notification: boolean;
    atomic: boolean;
  };
  badge: {
    messenger: number;
    trade: number;
    storeOrder: number;
    authority: "domain_badge" | "off";
  } | null;
};

type Props = {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
  tabletSplitListOnly?: boolean;
};

function clientValidate(dto: ShellHomeDto, prev: ShellHomeDto | null): string | null {
  if (dto.authority !== "domain_shell_read_ui_canary") return "invalid_authority";
  for (const row of dto.inbox) {
    if (row.domain !== "general_direct" && row.domain !== "group") return "inbox_contamination";
  }
  if (dto.tradeHub.domain !== "trade") return "trade_hub_domain";
  if (dto.storeOrderHub.domain !== "store_order") return "store_order_hub_domain";
  if (dto.storeOrderHub.exposesMemberIdentity !== false) return "store_order_member_identity";
  if (dto.counts.generalDirect !== dto.inbox.filter((r) => r.domain === "general_direct").length) {
    return "general_count_mismatch";
  }
  if (dto.counts.group !== dto.inbox.filter((r) => r.domain === "group").length) {
    return "group_count_mismatch";
  }
  if (prev) {
    if (prev.counts.generalDirect > 0 && dto.counts.generalDirect === 0) {
      return "general_rows_disappeared";
    }
    if (prev.counts.group > 0 && dto.counts.group === 0) return "group_rows_disappeared";
  }
  return null;
}

/**
 * Domain Home — Domain inbox + hubs for all authenticated viewers.
 * Fail inbox → full Legacy.
 * Trade/SO hub kill → that hub renders Legacy link stub (bundle scoped).
 */
export function DomainShellCanaryHomeGate(props: Props) {
  const [mode, setMode] = useState<"loading" | "canary" | "legacy">("loading");
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [dto, setDto] = useState<ShellHomeDto | null>(null);
  const [rollbackReason, setRollbackReason] = useState<string | null>(null);
  const prevDtoRef = useRef<ShellHomeDto | null>(null);
  const { language } = useI18n();
  const missedByRoom = useSyncExternalStore(
    subscribeRoomMissedCallBadge,
    getRoomMissedCallBadgeByRoomSnapshot,
    (): Record<string, number> => ({})
  );

  const rollbackInbox = useCallback(async (reason: string) => {
    setRollbackReason(reason);
    setDto(null);
    await requestServerBundleKill("inbox");
    setMode("legacy");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isClientBundleKilled("inbox")) {
          if (!cancelled) setMode("legacy");
          return;
        }
        const sb = getSupabaseClient();
        if (!sb) {
          if (!cancelled) setMode("legacy");
          return;
        }
        const { data } = await sb.auth.getUser();
        const uid = data.user?.id?.trim() ?? null;
        if (cancelled) return;
        setViewerId(uid);
        if (!isDomainShellReadUiCanaryViewer(uid)) {
          setMode("legacy");
          return;
        }
        const res = await fetch("/api/messenger/shell-home", { cache: "no-store" });
        if (!res.ok) {
          await rollbackInbox(`http_${res.status}`);
          return;
        }
        const body = (await res.json()) as ShellHomeDto;
        if (body.viewerUserId !== uid) {
          await rollbackInbox("viewer_spoof_or_mismatch");
          return;
        }
        const fail = clientValidate(body, prevDtoRef.current);
        if (fail) {
          await rollbackInbox(fail);
          return;
        }
        prevDtoRef.current = body;
        setDto(body);
        setMode("canary");
        // Hydrate room-attached missed_call for Room List badge (= unread + missed).
        void fetch("/api/me/notifications/badge-count?fresh=1", { cache: "no-store" })
          .then((r) => r.json())
          .then((badgeBody: {
            missedCallByRoom?: Record<string, number>;
            missedCall?: number;
            domainAppIcon?: { messenger: number; trade: number; storeOrder: number; missedCall: number };
          }) => {
            // Room-list missed_call only. App Icon writer = Domain projection apply — never here.
            publishRoomMissedCallBadgeByRoom(badgeBody.missedCallByRoom ?? {});
          })
          .catch(() => {
            /* fail-soft */
          });
        // App Icon / Bottom Domain surface SSOT = targets hub bundle (badge-count / hub-badge).
        // DO NOT publish shell-home.badge here — measured overwrite 4 → 34 (row unread ≠ targets).
      } catch {
        if (!cancelled) await rollbackInbox("runtime_exception");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rollbackInbox]);

  // Domain Realtime Authority applied → soft refresh Shell Home (allowlist Canary surface).
  useEffect(() => {
    if (mode !== "canary" || !viewerId) return;
    let cancelled = false;
    const onApplied = () => {
      void (async () => {
        try {
          const res = await fetch("/api/messenger/shell-home", { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const body = (await res.json()) as ShellHomeDto;
          if (cancelled || body.viewerUserId !== viewerId) return;
          const fail = clientValidate(body, prevDtoRef.current);
          if (fail) return;
          prevDtoRef.current = body;
          setDto(body);
          // List/Hub UI uses dto only — do not push shell.badge into App Icon surface.
        } catch {
          /* soft refresh fail-soft */
        }
      })();
    };
    window.addEventListener("dibay-domain-realtime-applied", onApplied);
    return () => {
      cancelled = true;
      window.removeEventListener("dibay-domain-realtime-applied", onApplied);
    };
  }, [mode, viewerId]);

  if (mode === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">
        {translateBy(language, "community_messenger_loading")}
      </div>
    );
  }

  if (mode === "legacy" || !dto) {
    return (
      <>
        {rollbackReason ? (
          <div className="sr-only" data-domain-shell-rollback={rollbackReason} />
        ) : null}
        <CommunityMessengerHome {...props} />
      </>
    );
  }

  const tradeLabel = translateBy(language, "community_messenger_trade_chats");
  const orderLabel = translateBy(language, "community_messenger_order_chats");
  const canaryLabel = translateBy(language, "community_messenger_domain_shell_canary");
  const generalLabel = translateBy(language, "community_messenger_general");
  const groupLabel = translateBy(language, "community_messenger_groups");
  const tradeKilled = isClientBundleKilled("trade");
  const soKilled = isClientBundleKilled("store_order_customer");
  const generalRows = dto.inbox.filter((row) => row.domain === "general_direct");
  const groupRows = dto.inbox.filter((row) => row.domain === "group");

  const renderInboxRow = (row: ShellInboxRow) => {
    const roomBadge = resolveRoomListBadgeCount({
      unreadCount: row.unreadCount,
      missedCallCount: missedByRoom[row.roomId] ?? 0,
    });
    return (
    <DomainCanaryShellRow
      key={`${row.domain}:${row.roomId}`}
      href={row.href}
      title={row.title}
      preview={row.previewText || (translateBy(language, "community_messenger_no_messages"))}
      avatarUrl={row.avatarUrl}
      avatarKind={row.domain === "group" ? "group" : "user"}
      unreadCount={roomBadge}
      time={formatDomainCanaryTime(row.lastMessageAt)}
      onNavigate={() =>
        markRoomEntryIntent(row.roomId, {
          title: row.title,
          avatarUrl: row.avatarUrl,
          expectedDomain: row.domain,
          expectedIdentityKey: row.domainIdentityKey,
        })
      }
    />
    );
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-sam-app"
      data-domain-shell-canary="1"
      data-viewer={viewerId ?? ""}
      data-tablet-split={props.tabletSplitListOnly ? "1" : "0"}
    >
      <div className="sr-only" data-domain-shell-produced-at={dto.producedAt}>
        {canaryLabel}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tradeKilled ? (
          <Link
            href="/community-messenger/trade-chats"
            className="flex min-h-[68px] items-center border-b border-sam-border px-3 text-sm text-sam-fg"
            data-trade-hub-authority="legacy"
          >
            {tradeLabel} (Legacy)
          </Link>
        ) : (
          <DomainCanaryShellRow
            href={dto.tradeHub.href}
            title={tradeLabel}
            preview={
              dto.tradeHub.previewText || (translateBy(language, "community_messenger_no_messages"))
            }
            unreadCount={dto.tradeHub.unreadRoomCount}
            time={formatDomainCanaryTime(dto.tradeHub.latestActivityAt ?? "")}
          />
        )}
        {soKilled ? (
          <Link
            href="/community-messenger/delivery-chats"
            className="flex min-h-[68px] items-center border-b border-sam-border px-3 text-sm text-sam-fg"
            data-so-hub-authority="legacy"
          >
            {orderLabel} (Legacy)
          </Link>
        ) : (
          <DomainCanaryShellRow
            href={dto.storeOrderHub.href}
            title={orderLabel}
            preview={
              dto.storeOrderHub.previewText ||
              (translateBy(language, "community_messenger_no_messages"))
            }
            unreadCount={dto.storeOrderHub.unreadRoomCount}
            time={formatDomainCanaryTime(dto.storeOrderHub.latestActivityAt ?? "")}
          />
        )}
        {generalRows.length > 0 ? (
          <section data-domain-inbox-section="general_direct">
            <h2 className="border-b border-sam-border bg-sam-app px-3 py-2 text-xs font-semibold text-sam-muted">
              {generalLabel}
            </h2>
            {generalRows.map(renderInboxRow)}
          </section>
        ) : null}
        {groupRows.length > 0 ? (
          <section data-domain-inbox-section="group">
            <h2 className="border-b border-sam-border bg-sam-app px-3 py-2 text-xs font-semibold text-sam-muted">
              {groupLabel}
            </h2>
            {groupRows.map(renderInboxRow)}
          </section>
        ) : null}
      </div>
    </div>
  );
}
