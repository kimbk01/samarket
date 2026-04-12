"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { philifeMeetingApi } from "@domain/philife/api";

function DotsVerticalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export type MeetingRoomHeroProps = {
  meetingId: string;
  title: string;
  entryPolicy: "open" | "approve" | "password" | "invite_only" | string;
  status: string;
  isClosed: boolean;
  coverImageUrl?: string | null;
  /** 승인 대기 수 — 메뉴 배지용 */
  pendingApprovalCount: number;
  joinedCount: number;
  maxMembers: number;
  showHostMenu: boolean;
  /** 모임 종료는 개설자만 */
  isHostUser: boolean;
  backHref: string;
  backAriaLabel?: string;
};

export function MeetingRoomHero({
  meetingId,
  title,
  entryPolicy,
  status,
  isClosed,
  coverImageUrl,
  pendingApprovalCount,
  joinedCount,
  maxMembers,
  showHostMenu,
  isHostUser,
  backHref,
  backAriaLabel = "뒤로가기",
}: MeetingRoomHeroProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const entryLabel =
    entryPolicy === "approve"
      ? "승인제"
      : entryPolicy === "invite_only"
        ? "초대/승인제"
        : entryPolicy === "password"
          ? "비밀번호"
          : "바로 참여";

  const isOpen = status === "open" && !isClosed;
  const statusLabel = !isOpen ? (status === "cancelled" ? "취소됨" : "마감") : null;

  const hasCover = !!coverImageUrl?.trim();

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname || ".", { scroll: false });
    setMenuOpen(false);
  };

  /** 멤버 탭 + 섹션(가입 요청 / 참여자) */
  const goMembersSection = (section: "pending" | "joined") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "members");
    params.set("memberSection", section);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setMenuOpen(false);
  };

  const openHostDetails = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "home");
    if (isHostUser) params.set("focus", "host");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setMenuOpen(false);
    requestAnimationFrame(() => {
      if (isHostUser) {
        document.getElementById("meeting-settings-accordion")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } else {
        document.getElementById("meeting-host-details")?.setAttribute("open", "");
        document.getElementById("meeting-host-details")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  };

  const onEndMeeting = async () => {
    if (!isHostUser) return;
    if (!window.confirm("모임을 종료할까요? 이후 새 참여는 불가합니다.")) return;
    setMenuOpen(false);
    const res = await fetch(philifeMeetingApi(meetingId).close(), { method: "POST" });
    const j = (await res.json()) as { ok?: boolean };
    if (res.ok && j.ok) router.refresh();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="overflow-hidden rounded-ui-rect border border-sam-border/80 bg-sam-surface shadow-sm">
      <div
        className={`relative flex min-h-[140px] flex-col justify-end px-4 pb-4 pt-12 ${
          hasCover ? "bg-cover bg-center" : "bg-gradient-to-br from-[#1a5f49] via-[#2d7a5e] to-[#256a52]"
        }`}
        style={hasCover ? { backgroundImage: `url(${coverImageUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/15 to-transparent" />
        <div className="absolute left-0 top-0 z-10 flex w-full items-start justify-between px-3 pt-2">
          <AppBackButton
            backHref={backHref}
            ariaLabel={backAriaLabel}
            className="rounded-full bg-black/15 text-white hover:bg-black/25"
            iconClassName="text-white"
          />
          {showHostMenu ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="모임 메뉴"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/15 text-white hover:bg-black/25"
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 min-w-[220px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface py-1 text-[13px] shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sam-fg hover:bg-sam-app"
                    onClick={() => goMembersSection("pending")}
                  >
                    <span>가입 요청 관리</span>
                    {pendingApprovalCount > 0 ? (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                        {pendingApprovalCount}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sam-fg hover:bg-sam-app"
                    onClick={() => goMembersSection("joined")}
                  >
                    참여자 관리
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sam-fg hover:bg-sam-app"
                    onClick={() => void openHostDetails()}
                  >
                    모임 수정
                  </button>
                  {isHostUser ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50"
                      onClick={() => void onEndMeeting()}
                    >
                      모임 종료
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative z-10 min-w-0">
          <h1 className="text-[20px] font-bold leading-snug text-white drop-shadow-sm">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#8fd4b3]/35 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              {entryLabel}
            </span>
            {!isOpen && statusLabel ? (
              <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                {statusLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-sam-border-soft bg-sam-surface sm:grid-cols-1">
        <div className="flex flex-col items-center py-3.5">
          <span className="text-[22px]">👥</span>
          <span className="mt-1 text-[13px] font-bold text-sam-fg">
            {joinedCount}
            <span className="font-normal text-sam-meta">/{maxMembers}</span>
          </span>
          <span className="text-[11px] text-sam-muted">멤버</span>
        </div>
      </div>
    </div>
  );
}
