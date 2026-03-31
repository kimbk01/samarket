"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingOpenChatRoomListEntry } from "@/lib/meeting-open-chat/types";
import { philifeAppPaths } from "@/lib/philife/paths";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";

function joinBadge(jt: MeetingOpenChatRoomListEntry["join_type"]) {
  if (jt === "password" || jt === "password_approval") return "비밀번호";
  if (jt === "approval") return "승인";
  return null;
}

export function MeetingOpenChatListClient({
  meetingId,
  variant = "standalone",
  postBackHref,
}: {
  meetingId: string;
  /** 모임 상세에 넣을 때: 높이·헤더 축소 */
  variant?: "standalone" | "embedded";
  /** embedded일 때 '← 글' (피드 게시글) */
  postBackHref?: string;
}) {
  const router = useRouter();
  const autoEnteredRef = useRef(false);
  useEffect(() => {
    autoEnteredRef.current = false;
  }, [meetingId]);
  const [rooms, setRooms] = useState<MeetingOpenChatRoomListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(
        `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean; rooms?: MeetingOpenChatRoomListEntry[]; error?: string };
      if (!res.ok || !json.ok) {
        if (!silent) {
          setError(json.error ?? "목록을 불러오지 못했습니다.");
          setRooms([]);
        }
        return;
      }
      const raw = json.rooms ?? [];
      const byId = new Map<string, MeetingOpenChatRoomListEntry>();
      for (const r of raw) {
        if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
      }
      setRooms([...byId.values()]);
      if (!silent) setError(null);
    } catch {
      if (!silent) {
        setError("네트워크 오류");
        setRooms([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load({ silent: true });
    }, 45000);
    return () => window.clearInterval(id);
  }, [load]);

  const base = `/philife/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat`;

  /** 방이 1개뿐이면 목록 없이 바로 채팅 화면으로 (다중 방만 목록 유지) */
  useEffect(() => {
    if (loading || error || !rooms || rooms.length !== 1 || autoEnteredRef.current) return;
    autoEnteredRef.current = true;
    const only = rooms[0];
    if (!only?.id) return;
    router.replace(`${base}/${encodeURIComponent(only.id)}`);
  }, [loading, error, rooms, base, router]);

  const totalUnread = (rooms ?? []).reduce(
    (s, r) => s + (r.viewerIsChatMember ? r.viewerUnreadCount : 0),
    0
  );

  const shellClass =
    variant === "embedded"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#f7f7f7] shadow-sm"
      : "min-h-[60vh] bg-[#f7f7f7]";

  const bodyClass =
    variant === "embedded"
      ? `min-h-0 flex-1 overflow-y-auto px-3 py-3 ${MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS}`
      : `px-3 py-3 ${MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS}`;

  return (
    <div className={shellClass}>
      {variant === "standalone" ? (
        <header className="sticky top-0 z-30 border-b border-gray-200/90 bg-[#f7f7f7]/95 backdrop-blur-md">
          <div className="flex h-[52px] items-center gap-2 px-3">
            <Link
              href={postBackHref ?? philifeAppPaths.meetingOpenChat(meetingId)}
              className="text-[15px] text-emerald-700"
            >
              {postBackHref ? "← 글" : "← 뒤로"}
            </Link>
            <h1 className="flex flex-1 items-center justify-center gap-1.5 text-center text-[16px] font-bold text-gray-900">
              <span>채팅</span>
              {totalUnread > 0 && (
                <span
                  className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold leading-none text-white"
                  aria-label={`읽지 않은 메시지 합계 ${totalUnread > 99 ? "99개 이상" : `${totalUnread}개`}`}
                >
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </h1>
            <span className="w-14" />
          </div>
        </header>
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200/90 bg-[#f7f7f7] px-2 py-2">
          {postBackHref ? (
            <Link href={postBackHref} className="shrink-0 text-[13px] font-semibold text-emerald-700">
              ← 글
            </Link>
          ) : (
            <span className="w-8 shrink-0" />
          )}
          <h2 className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-center text-[14px] font-bold text-gray-900">
            <span>채팅</span>
            {totalUnread > 0 && (
              <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </h2>
          <Link
            href={base}
            className="shrink-0 text-[12px] font-semibold text-emerald-700"
            title="전체 화면"
          >
            전체
          </Link>
        </div>
      )}

      <div className={bodyClass}>
        {loading && <p className="text-center text-sm text-gray-500">채팅방으로 이동하는 중…</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        {!loading && rooms && rooms.length === 0 && !error && (
          <p className="text-center text-sm text-gray-500">아직 채팅방이 없습니다.</p>
        )}
        {!loading && rooms && rooms.length === 1 && !error ? (
          <p className="text-center text-sm text-gray-500">채팅방으로 연결하는 중…</p>
        ) : null}
        <ul className="mt-2 space-y-2">
          {(rooms ?? []).map((r) => {
            const badge = joinBadge(r.join_type);
            return (
              <li key={r.id}>
                <Link
                  href={`${base}/${encodeURIComponent(r.id)}`}
                  className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs font-bold text-gray-500">
                    OC
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate ${r.viewerIsChatMember && r.viewerUnreadCount > 0 ? "font-bold text-gray-900" : "font-semibold text-gray-900"}`}
                      >
                        {r.title}
                      </span>
                      {badge && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-0.5 truncate text-[13px] ${r.viewerIsChatMember && r.viewerUnreadCount > 0 ? "font-medium text-gray-800" : "text-gray-500"}`}
                    >
                      {r.last_message_preview?.trim() || "메시지가 없습니다."}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{r.active_member_count}명</span>
                      {r.last_message_at && (
                        <span>{new Date(r.last_message_at).toLocaleString("ko-KR")}</span>
                      )}
                    </div>
                  </div>
                  {r.viewerIsChatMember && r.viewerUnreadCount > 0 && (
                    <div className="flex shrink-0 flex-col items-end justify-center self-center">
                      <span className="min-w-[1.5rem] rounded-full bg-rose-500 px-2 py-1 text-center text-[11px] font-bold leading-none text-white">
                        {r.viewerUnreadCount > 99 ? "99+" : r.viewerUnreadCount}
                      </span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {!loading && !error && ((rooms ?? []).length === 0 || (rooms ?? []).length > 1) ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`${base}/new`}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md"
            >
              새 채팅방
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
