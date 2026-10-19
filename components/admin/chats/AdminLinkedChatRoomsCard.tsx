"use client";

/**
 * 도메인 화면 내장 — 「이 대상의 채팅방」 카드 (설계 §2-3).
 * 상품 상세(거래)·주문 상세(배달)에서 같은 목록 API(`/api/admin/community-messenger/rooms`)를 쓰고,
 * 행을 누르면 방 상세(같은 시트 S1~S6)로 간다. 권한은 방 유형 규칙(거래 `products`·배달 `business` 허용)을 서버가 판정.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import type { AdminChatRoomListRow } from "@/lib/admin-community-messenger/list-admin-rooms-paged";
import { adminChatRoomDetailHref } from "@/lib/admin/chat-admin/admin-chat-links";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";

const CARD_LIMIT = 20;

export function AdminLinkedChatRoomsCard({
  target,
  returnTo,
}: {
  target: { kind: "trade"; postId: string } | { kind: "store_order"; orderId: string };
  /** 방 상세에서 돌아올 화면 */
  returnTo: string;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; code: string; status?: number }
    | { kind: "ready"; rows: AdminChatRoomListRow[] }
  >({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const qs =
    target.kind === "trade"
      ? `type=trade&postId=${encodeURIComponent(target.postId)}`
      : `type=store_order&orderId=${encodeURIComponent(target.orderId)}`;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/community-messenger/rooms?${qs}&limit=${CARD_LIMIT}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; rooms?: AdminChatRoomListRow[]; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setState({ kind: "error", code: json?.error || "load_failed", status: res.status });
          return;
        }
        setState({ kind: "ready", rows: json.rooms ?? [] });
      } catch {
        if (!cancelled) setState({ kind: "error", code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qs, reload]);

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-linked-chat-rooms={target.kind}
      aria-label={t("admin_chat_linked_rooms_title")}
    >
      <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_chat_linked_rooms_title")}</h2>
      <p className="mt-0.5 sam-text-helper text-sam-muted">{t("admin_chat_linked_rooms_desc")}</p>
      <div className="mt-3">
        {state.kind === "loading" ? (
          <AdminLoadingState ko={ko} />
        ) : state.kind === "error" ? (
          <AdminErrorState ko={ko} code={state.code} httpStatus={state.status} onRetry={() => setReload((n) => n + 1)} />
        ) : state.rows.length === 0 ? (
          <AdminEmptyState ko={ko} message={t("admin_chat_linked_rooms_empty")} />
        ) : (
          <ul className="divide-y divide-sam-border-soft">
            {state.rows.map((room) => {
              const status = adminChatLabel("room_status", room.roomStatus, ko);
              return (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={adminChatRoomDetailHref(room.id, returnTo)} className="font-medium text-signature underline">
                      {room.members.map((m) => m.label).join(", ") || room.title || t("admin_chat_rooms_untitled")}
                    </Link>
                    <p className="sam-text-xxs text-sam-muted">
                      {room.lastMessageAt ? formatAdminDateTime(room.lastMessageAt, language) : "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {room.openReportCount > 0 ? (
                      <AdminToneBadge tone="warning">{t("admin_chat_rooms_open_reports", { count: room.openReportCount })}</AdminToneBadge>
                    ) : null}
                    <AdminToneBadge tone={status.tone}>{status.label}</AdminToneBadge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
