"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimCategoryDto } from "@/lib/moim/moim-api-types";
import type { MessageKey } from "@/lib/i18n/messages";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { useMoimImageUpload } from "@/components/moim/use-moim-image-upload";
import { MoimErrorState, moimCls, useMoimToast } from "@/components/moim/moim-ui";
import { MoimCategoryField, isMoimCategoryInputValid, normalizeMoimTopic } from "@/components/moim/MoimCategoryField";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";

const STEPS = 4;
const MAX_QUESTIONS = 3;
/** 금지 모임 유형 안내 (설계 §2.5 · D10 — 당근 27663 목록) */
export const MOIM_PROHIBITED_TYPE_KEYS: readonly MessageKey[] = [
  "moim_rule_commercial",
  "moim_rule_religion",
  "moim_rule_politics",
  "moim_rule_dating",
  "moim_rule_mlm",
  "moim_rule_personal_info",
  "moim_rule_external_messenger",
  "moim_rule_illegal",
];

function parseYear(v: string): number | null {
  const n = Number(v.trim());
  return v.trim() && Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
}

/** 모임 만들기 4단계 (시안 U2 · 설계 P1, 카테고리 드롭다운으로 1단계 합침 — 2026-11-12) — 중간 저장 없음 */
export function MoimCreateWizard() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useMoimToast();
  const { uploading, upload } = useMoimImageUpload();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [categories, setCategories] = useState<MoimCategoryDto[] | null>(null);
  const [catError, setCatError] = useState(false);
  const [catReload, setCatReload] = useState(0);
  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [capacity, setCapacity] = useState("");
  const [joinMode, setJoinMode] = useState<"instant" | "approval">("instant");
  const [questions, setQuestions] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [nickname, setNickname] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const header = useMemo(() => ({ titleText: t("moim_create_title", { step, total: STEPS }) }), [t, step]);
  useRegisterMainTier1Header(header);

  useEffect(() => {
    const me = getHydrationSafeCurrentUser();
    if (me?.nickname) setNickname((n) => n || me.nickname);
  }, []);

  useEffect(() => {
    let alive = true;
    setCatError(false);
    void moimApi.categories().then((r) => {
      if (!alive) return;
      if (r.ok) setCategories(r.categories);
      else setCatError(true);
    });
    return () => {
      alive = false;
    };
  }, [catReload]);

  const capNum = capacity.trim() ? Number(capacity.trim()) : null;
  const capValid = capNum === null || (Number.isInteger(capNum) && capNum >= 2);
  const yMin = parseYear(ageMin);
  const yMax = parseYear(ageMax);
  const ageValid = (!ageMin.trim() || yMin !== null) && (!ageMax.trim() || yMax !== null) && (yMin === null || yMax === null || yMin <= yMax);

  const canNext =
    step === 1
      ? isMoimCategoryInputValid(categories, categoryId, topic) && name.trim().length > 0 && intro.trim().length > 0 && !uploading
      : step === 2
        ? capValid
        : step === 3
          ? ageValid && nickname.trim().length > 0
          : agree;

  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = await upload([f]);
    if (r.urls[0]) setCover(r.urls[0]);
    if (r.failed) toast.show(t("moim_screen_upload_failed"), "error");
  };

  const submit = async () => {
    if (!categoryId || busy) return;
    setBusy(true);
    setError(null);
    const r = await moimApi.create({
      name: name.trim(),
      intro: intro.trim(),
      categoryId,
      topicLabel: categories?.find((c) => c.id === categoryId)?.allowCustomTopic ? normalizeMoimTopic(topic) : null,
      joinMode,
      capacity: capNum,
      coverImageUrl: cover,
      ageMinBirthYear: yMin,
      ageMaxBirthYear: yMax,
      questions: joinMode === "approval" ? questions.map((q) => q.trim()).filter(Boolean) : [],
      nickname: nickname.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(t(moimErrorKey(r.error)));
      return;
    }
    router.replace(moimRoutes.home(r.moim_id));
  };

  const next = () => {
    setError(null);
    if (step < STEPS) setStep(step + 1);
    else void submit();
  };

  if (catError) return <MoimErrorState onRetry={() => setCatReload((k) => k + 1)} />;

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <div className={`${moimCls.column} flex-1 pb-28`}>
        <div className="flex gap-1 px-4 pt-3" aria-hidden>
          {Array.from({ length: STEPS }).map((_, i) => (
            <i key={i} className={`h-[3px] flex-1 rounded-full ${i < step ? "bg-sam-primary" : "bg-sam-border"}`} />
          ))}
        </div>

        {step === 1 ? (
          <section className="grid gap-4 px-4 pt-4">
            {categories === null ? (
              <div className="h-12 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
            ) : categories.length === 0 ? (
              <p className={moimCls.noticeInfo}>{t("moim_home_categories_preparing_body")}</p>
            ) : (
              <MoimCategoryField
                categories={categories}
                categoryId={categoryId}
                onCategoryChange={setCategoryId}
                topic={topic}
                onTopicChange={setTopic}
              />
            )}
            <label className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_name_label")}</span>
              <input className={moimCls.input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("moim_create_name_placeholder")} />
            </label>
            <label className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_intro_label")}</span>
              <textarea className={moimCls.textarea} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder={t("moim_create_intro_placeholder")} />
            </label>
            <div className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_cover_label")}</span>
              {cover ? (
                <div className="relative h-36 w-full overflow-hidden rounded-ui-rect">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-sam-surface text-sam-fg shadow"
                    aria-label={t("moim_create_cover_remove_aria")}
                    onClick={() => setCover(null)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={uploading}
                  className={`${moimCls.card} flex h-24 w-full flex-col items-center justify-center gap-1 text-[13px] text-sam-muted`}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="h-5 w-5" aria-hidden />
                  {uploading ? t("common_loading") : t("moim_create_cover_add_btn")}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
              <span className={moimCls.hint}>{t("moim_create_cover_hint")}</span>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-4 px-4 pt-4">
            <div className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_area_label")}</span>
              <p className={moimCls.hint}>{t("moim_create_area_hint")}</p>
            </div>
            <label className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_capacity_label")}</span>
              <input
                className={moimCls.input}
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={t("moim_create_capacity_placeholder")}
              />
              <span className={capValid ? moimCls.hint : "text-[12px] text-sam-danger"}>
                {capValid ? t("moim_create_capacity_hint") : t("moim_err_moim_capacity_invalid")}
              </span>
            </label>
            <div className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_join_mode_label")}</span>
              <div className="flex overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface" role="radiogroup">
                {(["instant", "approval"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={joinMode === m}
                    className={`flex-1 py-2.5 text-[13px] ${joinMode === m ? "bg-sam-primary-soft font-bold text-sam-primary" : "text-sam-fg"}`}
                    onClick={() => setJoinMode(m)}
                  >
                    {t(`moim_join_mode_${m}` as MessageKey)}
                  </button>
                ))}
              </div>
            </div>
            {joinMode === "approval" ? (
              <div className="grid gap-2">
                <span className={moimCls.label}>{t("moim_create_questions_label")}</span>
                {questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${moimCls.input} flex-1`}
                      value={q}
                      onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={t("moim_create_question_placeholder")}
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center text-sam-muted"
                      aria-label={t("moim_create_question_remove_aria")}
                      onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
                {questions.length < MAX_QUESTIONS ? (
                  <button type="button" className={`${moimCls.btnSecondary} ${moimCls.btnSm}`} onClick={() => setQuestions((qs) => [...qs, ""])}>
                    {t("moim_create_question_add_btn")}
                  </button>
                ) : null}
                <p className={moimCls.noticeWarn}>{t("moim_create_questions_warning")}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="grid gap-4 px-4 pt-4">
            <div className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_create_age_label")}</span>
              <div className="flex items-center gap-2">
                <input
                  className={`${moimCls.input} flex-1`}
                  inputMode="numeric"
                  maxLength={4}
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={t("moim_create_age_from_placeholder")}
                />
                <span className="text-sam-muted">~</span>
                <input
                  className={`${moimCls.input} flex-1`}
                  inputMode="numeric"
                  maxLength={4}
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={t("moim_create_age_to_placeholder")}
                />
              </div>
              <span className={ageValid ? moimCls.hint : "text-[12px] text-sam-danger"}>
                {ageValid ? t("moim_create_age_hint") : t("moim_create_age_invalid")}
              </span>
            </div>
            <label className="grid gap-1.5">
              <span className={moimCls.label}>{t("moim_profile_nickname_label")}</span>
              <input className={moimCls.input} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t("moim_profile_nickname_placeholder")} />
              <span className={moimCls.hint}>{t("moim_profile_privacy_note")}</span>
            </label>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="grid gap-3 px-4 pt-4">
            <h2 className={moimCls.sectionTitle}>{t("moim_create_rules_title")}</h2>
            <p className={moimCls.hint}>{t("moim_create_rules_lead")}</p>
            <ul className={`${moimCls.card} grid gap-1.5 p-3 text-[13px] text-sam-fg`}>
              {MOIM_PROHIBITED_TYPE_KEYS.map((k) => (
                <li key={k} className="flex gap-2">
                  <span aria-hidden className="text-sam-danger">
                    ×
                  </span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <p className={moimCls.hint}>{t("moim_create_rules_sanction_note")}</p>
            <label className="flex items-center gap-2 text-[14px] text-sam-fg">
              <input type="checkbox" className="h-4 w-4 accent-[color:var(--sam-primary)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              {t("moim_create_rules_agree")}
            </label>
          </section>
        ) : null}

        {error ? <p className={`${moimCls.noticeBad} mx-4 mt-4`}>{error}</p> : null}
      </div>

      <MoimStickyFooter>
        <div className={`${moimCls.column} flex gap-2`}>
          {step > 1 ? (
            <button type="button" className={`${moimCls.btnSecondary} flex-1`} onClick={() => setStep(step - 1)} disabled={busy}>
              {t("moim_create_prev_btn")}
            </button>
          ) : null}
          <button type="button" className={`${moimCls.btnPrimary} flex-1`} disabled={!canNext || busy} onClick={next}>
            {step < STEPS ? t("moim_create_next_btn") : t("moim_create_submit_btn")}
          </button>
        </div>
      </MoimStickyFooter>
      {toast.node}
    </div>
  );
}
