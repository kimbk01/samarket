"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet } from "@/components/ui/dibay-overlay";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { moimCls } from "@/components/moim/moim-ui";

export type MoimJoinValues = { answers: string[]; nickname: string; bio: string };

/**
 * 가입 시트 (시안 U3) — 승인제면 질문 답변 + 이 모임에서 쓸 프로필.
 * 초대 수락에도 같은 시트를 쓴다(questions 없이).
 */
export function MoimJoinSheet({
  open,
  onClose,
  title,
  submitLabel,
  questions,
  defaultNickname,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  questions: string[];
  defaultNickname?: string | null;
  /** 실패하면 오류 문구, 성공하면 null */
  onSubmit: (v: MoimJoinValues) => Promise<string | null>;
}) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questionCount = questions.length;
  useEffect(() => {
    if (!open) return;
    setAnswers(Array.from({ length: questionCount }, () => ""));
    setNickname(defaultNickname?.trim() || getHydrationSafeCurrentUser()?.nickname || "");
    setBio("");
    setError(null);
  }, [open, questionCount, defaultNickname]);

  const valid = nickname.trim().length > 0 && answers.every((a) => a.trim().length > 0);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit({ answers: answers.map((a) => a.trim()), nickname: nickname.trim(), bio: bio.trim() });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <DibayUsableAreaSheet
      open={open}
      onClose={onClose}
      preferredHeightRatio={null}
      header={<DibaySheetHeader title={title} onClose={onClose} closeLabel={t("common_close")} />}
      footer={
        <div className="px-4 pb-3 pt-2">
          <button type="button" className={`${moimCls.btnPrimary} w-full`} disabled={!valid || busy} onClick={submit}>
            {submitLabel}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 px-4 pb-2">
        {questions.map((q, i) => (
          <label key={i} className="grid gap-1.5">
            <span className={moimCls.label}>{q}</span>
            <textarea
              className={`${moimCls.textarea} min-h-[72px]`}
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((as) => as.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={t("moim_join_answer_placeholder")}
            />
          </label>
        ))}
        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_join_profile_title")}</span>
          <input
            className={moimCls.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t("moim_profile_nickname_placeholder")}
            aria-label={t("moim_profile_nickname_label")}
          />
          <input
            className={moimCls.input}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t("moim_profile_bio_placeholder")}
            aria-label={t("moim_profile_bio_label")}
          />
          <span className={moimCls.hint}>{t("moim_join_profile_hint")}</span>
        </div>
        <p className={moimCls.noticeInfo}>{t("moim_profile_privacy_short")}</p>
        {error ? <p className={moimCls.noticeBad}>{error}</p> : null}
      </div>
    </DibayUsableAreaSheet>
  );
}
