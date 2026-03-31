"use client";

import type { MeetingOpenChatParticipantPublic } from "@/lib/meeting-open-chat/types";

function roleLabel(role: MeetingOpenChatParticipantPublic["role"]): string {
  if (role === "owner") return "방장";
  if (role === "sub_admin") return "부방장";
  return "일반";
}

function formatLastSeenKo(iso: string | null): string {
  if (!iso) return "최근 활동 없음";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "최근 활동 없음";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금 활동";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function LineOpenChatParticipantSheet({
  open,
  title = "참여자",
  loading,
  members,
  viewerMemberId,
  onClose,
  onSelectMember,
}: {
  open: boolean;
  title?: string;
  loading: boolean;
  members: MeetingOpenChatParticipantPublic[];
  viewerMemberId: string | null;
  onClose: () => void;
  onSelectMember: (m: MeetingOpenChatParticipantPublic) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="relative max-h-[72vh] rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-[16px] font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-semibold text-emerald-700"
          >
            닫기
          </button>
        </div>
        <div className="overflow-y-auto px-2 pb-6 pt-1" style={{ maxHeight: "calc(72vh - 52px)" }}>
          {loading && <p className="py-8 text-center text-sm text-gray-500">불러오는 중…</p>}
          {!loading && members.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">참여자가 없습니다.</p>
          )}
          <ul className="divide-y divide-gray-100">
            {members.map((m) => {
              const isSelf = viewerMemberId !== null && m.memberId === viewerMemberId;
              return (
                <li key={m.memberId}>
                  <button
                    type="button"
                    onClick={() => onSelectMember(m)}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-gray-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs font-bold text-gray-500">
                      {m.openProfileImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.openProfileImageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        m.openNickname.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-gray-900">{m.openNickname}</span>
                        {isSelf && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            나
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            m.role === "owner"
                              ? "bg-amber-100 text-amber-900"
                              : m.role === "sub_admin"
                                ? "bg-violet-100 text-violet-900"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {roleLabel(m.role)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-gray-500">{formatLastSeenKo(m.lastSeenAt)}</p>
                      {m.introMessage ? (
                        <p className="mt-1 line-clamp-2 text-[12px] text-gray-600">{m.introMessage}</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
