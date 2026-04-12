"use client";

import { useEffect, useState } from "react";

export type JoinRequestModalPayload = {
  nickname: string;
  intro: string;
  reason: string;
  note: string;
  password?: string;
};

export function MeetingJoinRequestModal({
  open,
  onClose,
  defaultNickname = "",
  requirePassword = false,
  onSubmit,
  busy = false,
  submitError = "",
}: {
  open: boolean;
  onClose: () => void;
  defaultNickname?: string;
  /** 비밀번호 방 + 승인 조합 등 */
  requirePassword?: boolean;
  onSubmit: (payload: JoinRequestModalPayload) => void;
  busy?: boolean;
  /** 전송 실패 시 모달 안에 표시 (아래 버튼과 무관하게 보이도록) */
  submitError?: string;
}) {
  const [nickname, setNickname] = useState(defaultNickname);
  const [intro, setIntro] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setNickname(defaultNickname);
      setIntro("");
      setReason("");
      setNote("");
      setPassword("");
    }
  }, [open, defaultNickname]);

  if (!open) return null;

  const canSubmit =
    !busy &&
    (!requirePassword || password.trim().length > 0) &&
    nickname.trim().length > 0 &&
    reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="join-req-title">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface shadow-xl sm:rounded-ui-rect">
        <div className="sticky top-0 flex items-center justify-between border-b border-sam-border-soft bg-sam-surface px-4 py-3">
          <h2 id="join-req-title" className="text-[16px] font-bold text-sam-fg">
            모임 참여 요청
          </h2>
          <button type="button" onClick={onClose} className="rounded-ui-rect px-2 py-1 text-[13px] text-sam-muted hover:bg-sam-surface-muted" disabled={busy}>
            닫기
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-sam-muted">
            모임장에게 전달됩니다. 승인 후 모임 참여 상태가 갱신됩니다.
          </p>
          <Field label="이름" required hint="운영자가 확인할 수 있는 이름을 적어 주세요.">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] outline-none focus:border-emerald-400"
              placeholder="예: BK"
              disabled={busy}
            />
          </Field>
          <Field label="소개">
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] outline-none focus:border-emerald-400"
              placeholder="예: BGC 거주 / 운동 좋아함"
              disabled={busy}
            />
          </Field>
          <Field label="참여 이유" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={800}
              className="mt-1 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] outline-none focus:border-emerald-400"
              placeholder="예: 주말 축구 같이 하고 싶어요"
              disabled={busy}
            />
          </Field>
          <Field label="메모">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] outline-none focus:border-emerald-400"
              placeholder="예: 처음 참여입니다"
              disabled={busy}
            />
          </Field>
          {requirePassword ? (
            <Field label="입장 비밀번호" required>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] outline-none focus:border-emerald-400"
                placeholder="비밀번호"
                disabled={busy}
              />
            </Field>
          ) : null}
          {submitError ? (
            <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-700" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>
        <div className="sticky bottom-0 flex gap-2 border-t border-sam-border-soft bg-sam-surface px-4 py-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-ui-rect border border-sam-border py-3 text-[14px] font-medium text-sam-fg" disabled={busy}>
            취소
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                nickname: nickname.trim(),
                intro: intro.trim(),
                reason: reason.trim(),
                note: note.trim(),
                ...(requirePassword ? { password: password.trim() } : {}),
              })
            }
            className="flex-1 rounded-ui-rect bg-emerald-600 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "전송 중…" : "신청 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-sam-fg">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {hint ? <p className="mt-0.5 text-[11px] text-sam-meta">{hint}</p> : null}
      {children}
    </div>
  );
}
