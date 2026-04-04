"use client";

import { useEffect, useState } from "react";

/** 기본 단톡방 입장 — 비밀번호·승인 입력 후 한 번에 모임 가입 + 방 입장 */
export function MeetingOpenChatRoomCredentialsModal({
  open,
  onClose,
  busy,
  error,
  defaultNickname = "",
  showRoomPassword,
  showApprovalIntro,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string;
  defaultNickname?: string;
  showRoomPassword: boolean;
  showApprovalIntro: boolean;
  onSubmit: (p: { openNickname: string; roomPassword: string; introMessage: string }) => void;
}) {
  const [nick, setNick] = useState(defaultNickname);
  const [pwd, setPwd] = useState("");
  const [intro, setIntro] = useState("");

  useEffect(() => {
    if (open) {
      setNick(defaultNickname);
      setPwd("");
      setIntro("");
    }
  }, [open, defaultNickname]);

  if (!open) return null;

  const canSubmit =
    !busy &&
    nick.trim().length > 0 &&
    (!showRoomPassword || pwd.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oc-cred-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="oc-cred-title" className="text-[16px] font-bold text-gray-900">
            {showApprovalIntro ? "단톡방 입장 신청" : "단톡방 입장"}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[13px] text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            onClick={onClose}
            disabled={busy}
          >
            닫기
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <label className="block text-[11px] font-semibold text-gray-700">채팅 닉네임</label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={40}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px]"
            disabled={busy}
          />
          {showRoomPassword && (
            <>
              <label className="block text-[11px] font-semibold text-gray-700">방 비밀번호</label>
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="off"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px]"
                disabled={busy}
              />
            </>
          )}
          {showApprovalIntro && (
            <>
              <label className="block text-[11px] font-semibold text-gray-700">신청 메시지 (선택)</label>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[14px]"
                disabled={busy}
              />
            </>
          )}
          {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-emerald-600 py-3 text-[15px] font-bold text-white disabled:opacity-45"
            onClick={() =>
              onSubmit({
                openNickname: nick.trim(),
                roomPassword: pwd,
                introMessage: intro.trim(),
              })
            }
          >
            {busy ? "처리 중…" : showApprovalIntro ? "신청하기" : "입장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
