"use client";

import { useEffect, useState } from "react";

/** 모임 비밀번호 입력 전용 팝업 */
export function MeetingPasswordOnlyModal({
  open,
  onClose,
  onSubmit,
  busy,
  error = "",
  title = "비밀번호로 참여",
  hint = "모임에서 설정한 비밀번호를 입력하면 바로 참여할 수 있어요.",
  submitLabel = "참여하기",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  busy: boolean;
  error?: string | null;
  /** 다른 맥락용 제목 */
  title?: string;
  /** null 이면 안내 문구 숨김 */
  hint?: string | null;
  submitLabel?: string;
}) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) setPassword("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="m-pwd-title"
    >
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface shadow-xl sm:rounded-ui-rect">
        <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
          <h2 id="m-pwd-title" className="sam-text-body-lg font-bold text-sam-fg">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-ui-rect px-2 py-1 sam-text-body-secondary text-sam-muted hover:bg-sam-surface-muted disabled:opacity-40"
            onClick={onClose}
            disabled={busy}
          >
            닫기
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {hint ? <p className="sam-text-helper leading-relaxed text-sam-muted">{hint}</p> : null}
          <label className="block sam-text-helper font-semibold text-sam-fg">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body outline-none focus:border-emerald-500"
            placeholder="비밀번호 입력"
            disabled={busy}
          />
          {error ? <p className="sam-text-helper text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={busy || !password.trim()}
            className="w-full rounded-ui-rect bg-emerald-600 py-3 sam-text-body font-bold text-white disabled:opacity-45"
            onClick={() => onSubmit(password.trim())}
          >
            {busy ? "확인 중…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
