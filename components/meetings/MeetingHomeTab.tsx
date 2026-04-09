"use client";

import { useState } from "react";
import type { NeighborhoodMeetingDetailDTO, NeighborhoodMeetingNoticeDTO } from "@/lib/neighborhood/types";
import { philifeAppPaths } from "@domain/philife/paths";
import Link from "next/link";
import { MeetingSettingsPanel } from "@/components/meetings/MeetingSettingsPanel";
import { formatKorDateTimeFull, formatKorDate } from "@/lib/ui/format-meeting-date";

/** 필라이프/커뮤니티 모임 상세 탭 (URL `tab=` 과 동일) */
export type MeetingDetailTabId = "home" | "notices" | "feed" | "chat" | "album" | "members";

interface MeetingHomeTabProps {
  meeting: NeighborhoodMeetingDetailDTO;
  notices: NeighborhoodMeetingNoticeDTO[];
  joinedMembers?: { userId: string; name: string; role?: string }[];
  onTabChange?: (tab: MeetingDetailTabId) => void;
  onLeave?: () => void;
  isLeaving?: boolean;
  isHost?: boolean;
  /** 운영 권한(모임장·공동운영자)일 때 승인 대기 인원 — 홈에서 멤버 탭 안내 */
  pendingApprovalCount?: number;
  /**
   * true: 상단 `MeetingInfoCard` + 탭바가 이미 있으므로
   * 홈 탭에서 일시·정원 바·아이콘 퀵네비(탭과 중복)는 생략한다.
   */
  compactSummary?: boolean;
}

const NAV_ACTIONS = [
  { tab: "notices", emoji: "📢", label: "공지" },
  { tab: "feed", emoji: "📝", label: "피드" },
  { tab: "chat", emoji: "💬", label: "채팅" },
  { tab: "album", emoji: "📸", label: "앨범" },
  { tab: "members", emoji: "👥", label: "멤버" },
] as const;

function AvatarCircle({ name, role, size = "md" }: { name: string; role?: string; size?: "sm" | "md" }) {
  const isHost = role === "host";
  const dim = size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-[13px]";
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${
        isHost ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      {(name || "?").charAt(0)}
    </div>
  );
}

/** 상단 요약 카드 없이 홈만 쓸 때용 (모임 상세 페이지에서는 생략) */
function MeetingHomeFullSummary({
  meeting,
  joinedMembers,
}: {
  meeting: NeighborhoodMeetingDetailDTO;
  joinedMembers: { userId: string; name: string; role?: string }[];
}) {
  const joinedCount = meeting.joined_count ?? meeting.member_count ?? joinedMembers.length;
  const maxMembers = meeting.max_members ?? 0;
  const capacityPct = maxMembers > 0 ? Math.min(100, (joinedCount / maxMembers) * 100) : 0;
  const entryLabel =
    meeting.entry_policy === "approve"
      ? "승인제"
      : meeting.entry_policy === "invite_only"
        ? "초대/승인제"
        : meeting.entry_policy === "password"
          ? "비밀번호"
          : "바로 참여";
  const isClosed =
    meeting.status === "ended" ||
    meeting.status === "finished" ||
    meeting.status === "cancelled" ||
    !!meeting.is_closed;

  return (
    <div className="rounded-ui-rect border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-gray-600">
        {meeting.tenure_type !== "long" &&
        meeting.meeting_date &&
        !Number.isNaN(Date.parse(meeting.meeting_date)) ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[14px]">📅</span>
            {formatKorDateTimeFull(meeting.meeting_date)}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className="text-[14px]">👥</span>
          {joinedCount}/{maxMembers}명
        </span>
        {meeting.tenure_type === "long" ? (
          <span className="rounded-full bg-signature/10 px-2 py-0.5 text-[11px] font-semibold text-gray-800">
            장기 모임
          </span>
        ) : null}
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            isClosed ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {isClosed ? "마감" : entryLabel}
        </span>
      </div>
      {maxMembers > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${
                capacityPct >= 90 ? "bg-red-400" : "bg-emerald-400"
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-gray-400">
            {maxMembers - joinedCount > 0 ? `${maxMembers - joinedCount}명 더 참여 가능` : "정원 마감"}
          </p>
        </div>
      )}
    </div>
  );
}

export function MeetingHomeTab({
  meeting,
  notices,
  joinedMembers = [],
  onTabChange,
  onLeave,
  isLeaving = false,
  isHost = false,
  pendingApprovalCount = 0,
  compactSummary = false,
}: MeetingHomeTabProps) {
  const [descExpanded, setDescExpanded] = useState(false);

  const latestNotice = notices[0] ?? null;
  const desc = meeting.description ?? "";
  const isLongDesc = desc.length > 120;
  const hostMember =
    joinedMembers.find((m) => m.role === "host") ?? joinedMembers[0] ?? null;

  return (
    <div className="space-y-3 pb-24 pt-1">
      {/* ── 환영 메시지 ────────────────────────────────── */}
      {meeting.welcome_message ? (
        <div className="flex items-start gap-3 rounded-ui-rect bg-emerald-50 px-4 py-3">
          <span className="mt-0.5 text-[18px]">🙌</span>
          <p className="text-[13px] leading-relaxed text-emerald-900">{meeting.welcome_message}</p>
        </div>
      ) : null}

      {isHost && pendingApprovalCount > 0 && onTabChange ? (
        <div className="flex items-center gap-3 rounded-ui-rect border border-amber-200 bg-amber-50/90 px-4 py-3 shadow-sm">
          <span className="text-[22px]">⏳</span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-amber-950">
              가입 승인 대기 {pendingApprovalCount}명
            </p>
            <p className="mt-0.5 text-[12px] text-amber-800/90">
              멤버 탭에서 신청 내용을 확인하고 승인할 수 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTabChange("members")}
            className="shrink-0 rounded-ui-rect bg-amber-600 px-3 py-2 text-[12px] font-semibold text-white active:bg-amber-700"
          >
            확인
          </button>
        </div>
      ) : null}

      {!compactSummary ? (
        <>
          <MeetingHomeFullSummary meeting={meeting} joinedMembers={joinedMembers} />
          {joinedMembers.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <div className="flex -space-x-2.5">
                {joinedMembers.slice(0, 7).map((m) => (
                  <AvatarCircle key={m.userId} name={m.name} role={m.role} size="sm" />
                ))}
                {joinedMembers.length > 7 && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-500 ring-2 ring-white">
                    +{joinedMembers.length - 7}
                  </div>
                )}
              </div>
              {onTabChange && (
                <button
                  type="button"
                  onClick={() => onTabChange("members")}
                  className="text-[12px] text-gray-400 hover:text-emerald-600"
                >
                  전체 멤버 →
                </button>
              )}
            </div>
          )}
          {onTabChange && (
            <div className="grid grid-cols-5 gap-1">
              {NAV_ACTIONS.map(({ tab, emoji, label }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(tab)}
                  className="flex flex-col items-center gap-1 rounded-ui-rect border border-gray-100 bg-white py-3 text-center transition-colors active:bg-gray-50"
                >
                  <span className="text-[22px]">{emoji}</span>
                  <span className="text-[11px] font-medium text-gray-600">{label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ── 모임 소개 ─────────────────────────────────────── */}
      {desc ? (
        <div className="rounded-ui-rect border border-gray-200/80 bg-white px-4 py-3.5 shadow-sm">
          <p className="text-[14px] font-semibold text-gray-800">모임 소개</p>
          <p
            className={`mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800 ${
              !descExpanded && isLongDesc ? "line-clamp-4" : ""
            }`}
          >
            {desc}
          </p>
          {isLongDesc && (
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="mt-1.5 text-[12px] font-medium text-[#2d7a5e]"
            >
              {descExpanded ? "접기" : "더 보기"}
            </button>
          )}
        </div>
      ) : null}

      {/* ── 모임장 전용: 설정 패널 ──────────────────────── */}
      {isHost && <MeetingSettingsPanel meeting={meeting} />}

      {/* ── 공지 카드 (홈 탭) ─────────────────────────────── */}
      <div className="overflow-hidden rounded-ui-rect border border-gray-200/80 bg-white shadow-sm">
        <p className="px-4 pt-3.5 text-[14px] font-semibold text-gray-800">공지</p>
        <div className="mx-3 mb-1 mt-2 rounded-ui-rect border border-amber-100/90 bg-[#fffbeb] px-3.5 py-3">
          <div className="flex gap-2.5">
            <span className="mt-0.5 shrink-0 text-[20px]" aria-hidden>
              📢
            </span>
            <div className="min-w-0 flex-1">
              {latestNotice ? (
                <>
                  <p className="text-[13px] font-semibold text-gray-900">
                    {latestNotice.title || "공지"}
                  </p>
                  {latestNotice.body ? (
                    <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-gray-700">
                      {latestNotice.body}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-amber-600/80">
                    {formatKorDate(latestNotice.created_at)}
                  </p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-gray-600">
                  새로운 공지사항입니다. 모임 공지를 여기에 작성하세요.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 border-t border-gray-100 py-3">
          {onTabChange ? (
            <>
              <button
                type="button"
                onClick={() => onTabChange("feed")}
                className="text-[12px] font-medium text-gray-500 hover:text-[#2d7a5e]"
              >
                전체 게시글 보기 &gt;
              </button>
              <button
                type="button"
                onClick={() => onTabChange("notices")}
                className="text-[11px] text-gray-400 hover:text-[#2d7a5e]"
              >
                공지 목록 보기
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── 모임장 · 멤버 프리뷰 (컴팩트 홈) ───────────────── */}
      {compactSummary && joinedMembers.length > 0 && onTabChange ? (
        <div className="flex items-center justify-between rounded-ui-rect border border-gray-200/80 bg-white px-4 py-3.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <AvatarCircle
              name={hostMember?.name ?? "?"}
              role="host"
              size="md"
            />
            <p className="truncate text-[13px] text-gray-800">
              <span className="text-gray-500">모임장</span> :{" "}
              <span className="font-semibold text-gray-900">{hostMember?.name ?? "—"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTabChange("members")}
            className="flex shrink-0 items-center gap-0.5 text-gray-400"
            aria-label="멤버 전체 보기"
          >
            <div className="flex -space-x-2">
              {joinedMembers
                .filter((m) => m.role !== "host")
                .slice(0, 4)
                .map((m) => (
                  <AvatarCircle key={m.userId} name={m.name} role={m.role} size="sm" />
                ))}
            </div>
            <span className="pl-1 text-[16px]">›</span>
          </button>
        </div>
      ) : null}

      {/* ── 원본 게시글 링크 + 모임 나가기 ─────────────── */}
      <div className="flex flex-col items-center gap-2 pb-2 pt-1">
        <Link
          href={philifeAppPaths.post(meeting.post_id)}
          className="text-[12px] text-sky-600 underline"
        >
          원본 게시글 보기
        </Link>
        {typeof onLeave === "function" && (
          <button
            type="button"
            disabled={isLeaving}
            onClick={onLeave}
            className="text-[12px] text-gray-400 hover:text-red-500 disabled:opacity-50"
          >
            {isLeaving ? "처리 중…" : "모임 나가기"}
          </button>
        )}
      </div>
    </div>
  );
}
