"use client";

/** LINE 오픈채팅 방 입장 — 본문 폼 대신 모달만 */
export function MeetingOpenChatJoinDialog({
  roomTitle,
  needsApprovalIntro,
  hasPassword,
  joinNick,
  setJoinNick,
  joinPw,
  setJoinPw,
  joinIntro,
  setJoinIntro,
  busy,
  error,
  onJoin,
}: {
  roomTitle: string;
  needsApprovalIntro: boolean;
  hasPassword: boolean;
  joinNick: string;
  setJoinNick: (v: string) => void;
  joinPw: string;
  setJoinPw: (v: string) => void;
  joinIntro: string;
  setJoinIntro: (v: string) => void;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oc-join-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 id="oc-join-title" className="text-[17px] font-bold text-gray-900">
            {needsApprovalIntro ? "입장 신청" : "채팅방 입장"}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-gray-500">{roomTitle}</p>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700">채팅 닉네임</label>
            <input
              value={joinNick}
              onChange={(e) => setJoinNick(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px]"
              placeholder="방에서 쓸 닉네임"
              maxLength={40}
              disabled={busy}
            />
          </div>
          {hasPassword && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-700">방 비밀번호</label>
              <input
                type="password"
                value={joinPw}
                onChange={(e) => setJoinPw(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px]"
                placeholder="비밀번호"
                disabled={busy}
                autoComplete="off"
              />
            </div>
          )}
          {needsApprovalIntro && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-700">신청 메시지 (선택)</label>
              <textarea
                value={joinIntro}
                onChange={(e) => setJoinIntro(e.target.value)}
                className="mt-1 min-h-[72px] w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[14px]"
                maxLength={500}
                disabled={busy}
              />
            </div>
          )}
          {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={
              busy ||
              !joinNick.trim() ||
              (hasPassword && !joinPw.trim())
            }
            className="w-full rounded-full bg-[#06C755] py-3 text-[15px] font-bold text-white disabled:opacity-45"
            onClick={() => onJoin()}
          >
            {busy ? "처리 중…" : needsApprovalIntro ? "입장 신청" : "입장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
