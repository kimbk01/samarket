"use client";

import { useEffect, useState } from "react";
import { MOIM_JOIN_ANSWER_MAX } from "@/lib/moim/moim-state-gate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet } from "@/components/ui/dibay-overlay";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { MoimAvatar, moimCls } from "@/components/moim/moim-ui";
import { inMoimSheet } from "@/components/moim/MoimReportSheet";

export type MoimJoinValues = { answers: string[]; nickname: string; bio: string };

/**
 * 가입 시트 (시안 U3) — 승인제면 질문 답변 + 이 모임에서 쓸 프로필.
 * 초대 수락에도 같은 시트를 쓴다(수락이 가입 신청이 되는 초대면 질문도 · R3 U-13).
 * 프로필은 카드(아바타·닉네임·안내·「수정」)로 보이고, 「수정」을 누르면 입력칸이 열린다 (시안 U3 · R3 U3-sheet-profile-card).
 * 시트 안 버튼·카드·입력 = 12px (R3 U-07).
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
  const [editing, setEditing] = useState(false);

  const questionCount = questions.length;
  useEffect(() => {
    if (!open) return;
    setAnswers(Array.from({ length: questionCount }, () => ""));
    setNickname(defaultNickname?.trim() || getHydrationSafeCurrentUser()?.nickname || "");
    setBio("");
    setError(null);
    setEditing(false);
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
          <button type="button" className={`${inMoimSheet(moimCls.btnPrimary)} w-full`} disabled={!valid || busy} onClick={submit}>
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
              className={`${inMoimSheet(moimCls.textarea)} min-h-[72px]`}
              value={answers[i] ?? ""}
              maxLength={MOIM_JOIN_ANSWER_MAX}
              onChange={(e) => setAnswers((as) => as.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={t("moim_join_answer_placeholder")}
            />
            {/* R5 B11: 1,000자에서 멈추고 몰래 자르지 않는다 */}
            <span className={`${moimCls.hint} text-right`}>
              {(answers[i] ?? "").length}/{MOIM_JOIN_ANSWER_MAX}
            </span>
          </label>
        ))}
        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_join_profile_title")}</span>
          {editing ? (
            <>
              <input
                className={inMoimSheet(moimCls.input)}
                value={nickname}
                maxLength={40}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t("moim_profile_nickname_placeholder")}
                aria-label={t("moim_profile_nickname_label")}
              />
              <input
                className={inMoimSheet(moimCls.input)}
                value={bio}
                maxLength={300}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t("moim_profile_bio_placeholder")}
                aria-label={t("moim_profile_bio_label")}
              />
              <span className={moimCls.hint}>{t("moim_join_profile_hint")}</span>
            </>
          ) : (
            <div className={`${inMoimSheet(moimCls.card)} flex items-center gap-2.5 py-1 pl-3 pr-1`}>
              <MoimAvatar url={null} name={nickname} size={36} />
              <span className="min-w-0 flex-1">
                <b className="block break-words text-[13.5px] text-sam-fg">{nickname || t("moim_profile_nickname_placeholder")}</b>
                <span className={`${moimCls.hint} block`}>{t("moim_join_profile_card_hint")}</span>
              </span>
              <button
                type="button"
                className="inline-flex min-h-[length:var(--sam-tap-min)] shrink-0 items-center px-3 text-[13px] text-sam-muted"
                onClick={() => setEditing(true)}
              >
                {t("common_edit")}
              </button>
            </div>
          )}
        </div>
        <p className={inMoimSheet(moimCls.noticeInfo)}>{t("moim_profile_privacy_short")}</p>
        {error ? <p className={inMoimSheet(moimCls.noticeBad)}>{error}</p> : null}
      </div>
    </DibayUsableAreaSheet>
  );
}
