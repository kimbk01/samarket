"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  MeetingOpenChatIdentityMode,
  MeetingOpenChatJoinAs,
} from "@/lib/meeting-open-chat/types";

/** LINE 오픈채팅 방 입장 — 본문 폼 대신 모달만 */
export function MeetingOpenChatJoinDialog({
  roomTitle,
  needsApprovalIntro,
  hasPassword,
  identityMode,
  joinAs,
  setJoinAs,
  suggestedRealname,
  joinNick,
  setJoinNick,
  joinPw,
  setJoinPw,
  joinIntro,
  setJoinIntro,
  busy,
  error,
  onClose,
  onJoin,
}: {
  roomTitle: string;
  needsApprovalIntro: boolean;
  hasPassword: boolean;
  identityMode: MeetingOpenChatIdentityMode;
  joinAs: MeetingOpenChatJoinAs;
  setJoinAs: (v: MeetingOpenChatJoinAs) => void;
  suggestedRealname: string | null;
  joinNick: string;
  setJoinNick: (v: string) => void;
  joinPw: string;
  setJoinPw: (v: string) => void;
  joinIntro: string;
  setJoinIntro: (v: string) => void;
  busy: boolean;
  error: string | null;
  onClose?: () => void;
  onJoin: () => void;
}) {
  const realnameOnly = identityMode === "realname";
  const canChooseNickname = identityMode === "nickname_optional";
  const joiningWithNickname = canChooseNickname && joinAs === "nickname";
  const contentRef = useRef<HTMLDivElement>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const joinPolicySummary = hasPassword
    ? "비밀번호를 확인한 뒤 바로 입장합니다."
    : needsApprovalIntro
      ? "신청 메시지를 보내면 방장 승인 후 입장합니다."
      : "확인 즉시 바로 입장합니다.";
  const identitySummary = realnameOnly
    ? "이 방은 모두 실명으로 표시됩니다."
    : joinAs === "realname"
      ? "이번 입장은 실명으로 표시됩니다."
      : "이번 입장은 입력한 닉네임으로 표시됩니다.";

  useLayoutEffect(() => {
    const applyViewportInset = () => {
      if (typeof window === "undefined") return;
      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardInset(0);
        return;
      }
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 80 ? Math.round(inset) : 0);
    };
    applyViewportInset();
    window.addEventListener("resize", applyViewportInset);
    window.visualViewport?.addEventListener("resize", applyViewportInset);
    window.visualViewport?.addEventListener("scroll", applyViewportInset);
    return () => {
      window.removeEventListener("resize", applyViewportInset);
      window.visualViewport?.removeEventListener("resize", applyViewportInset);
      window.visualViewport?.removeEventListener("scroll", applyViewportInset);
    };
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 120);
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      style={{
        paddingBottom: `max(${keyboardInset}px, env(safe-area-inset-bottom, 0px))`,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="oc-join-title"
    >
      <div
        ref={contentRef}
        className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        style={{
          maxHeight: `min(90vh, calc(100dvh - ${Math.max(16, keyboardInset + 12)}px))`,
        }}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          {onClose ? (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[12px] text-gray-500 hover:bg-gray-100 disabled:opacity-45"
                onClick={onClose}
                disabled={busy}
              >
                닫기
              </button>
            </div>
          ) : null}
          <h2 id="oc-join-title" className="text-[17px] font-bold text-gray-900">
            {needsApprovalIntro ? "입장 신청" : "채팅방 입장"}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-gray-500">{roomTitle}</p>
        </div>
        <div
          className="space-y-3 px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-[12px] leading-relaxed text-emerald-900">
            <p className="font-bold">입장 결과 미리보기</p>
            <p className="mt-1">{joinPolicySummary}</p>
            <p className="mt-1">{identitySummary}</p>
          </div>
          {realnameOnly ? (
            <div className="rounded-xl bg-gray-50 px-3 py-3">
              <p className="text-[11px] font-semibold text-gray-700">참여 방식</p>
              <p className="mt-1 text-[14px] font-semibold text-gray-900">실명으로 참여</p>
              <p className="mt-1 text-[12px] text-gray-500">
                {suggestedRealname?.trim()
                  ? `표시 이름: ${suggestedRealname}`
                  : "프로필 실명이 등록되어 있어야 입장할 수 있습니다."}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-gray-700">표시 이름 선택</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setJoinAs("realname")}
                  disabled={busy}
                  className={`rounded-xl border px-3 py-3 text-[14px] font-semibold ${
                    joinAs === "realname"
                      ? "border-[#06C755] bg-[#e9f9ef] text-[#088c43]"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  실명
                </button>
                <button
                  type="button"
                  onClick={() => setJoinAs("nickname")}
                  disabled={busy}
                  className={`rounded-xl border px-3 py-3 text-[14px] font-semibold ${
                    joinAs === "nickname"
                      ? "border-[#06C755] bg-[#e9f9ef] text-[#088c43]"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  닉네임
                </button>
              </div>
              {joinAs === "realname" ? (
                <div className="mt-2 rounded-xl bg-gray-50 px-3 py-3 text-[12px] text-gray-600">
                  {suggestedRealname?.trim()
                    ? `실명으로 입장합니다: ${suggestedRealname}`
                    : "프로필 실명이 없으면 실명 참여를 사용할 수 없습니다."}
                </div>
              ) : (
                <div className="mt-2">
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
              )}
            </div>
          )}
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
              ((realnameOnly || joinAs === "realname") && !suggestedRealname?.trim()) ||
              (joiningWithNickname && !joinNick.trim()) ||
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
