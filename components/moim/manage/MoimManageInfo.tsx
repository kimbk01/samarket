"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeUploadImageUrl } from "@/lib/philife/api";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimCategoryDto, MoimDetailDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  MoimManageFrame,
  moimManageCardClass,
  moimManageInputClass,
  moimManageTextareaClass,
  useMoimManageToast,
  useMoimResource,
} from "./moim-manage-shared";

const NAME_MIN = 2;
const NAME_MAX = 30;
const INTRO_MIN = 10;
const INTRO_MAX = 1000;
const QUESTIONS_MAX = 3;
const QUESTION_MAX_LEN = 200;

type JoinMode = "instant" | "approval";
type Patch = Parameters<typeof moimApi.updateInfo>[1];

function parseOptionalInt(raw: string): number | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return "invalid";
  return Number(s);
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function InfoForm({ detail, reload }: { detail: MoimDetailDto; reload: () => void }) {
  const { t, language } = useI18n();
  const toast = useMoimManageToast();
  const loadCategories = useCallback(() => moimApi.categories(), []);
  const categories = useMoimResource(loadCategories);

  const [name, setName] = useState(detail.name);
  const [intro, setIntro] = useState(detail.intro);
  const [cover, setCover] = useState<string | null>(detail.coverImageUrl);
  const [categoryId, setCategoryId] = useState<string | null>(detail.category?.id ?? null);
  const [capacity, setCapacity] = useState(detail.capacity != null ? String(detail.capacity) : "");
  const [joinMode, setJoinMode] = useState<JoinMode>(detail.joinMode);
  const [questions, setQuestions] = useState<string[]>(detail.joinQuestions);
  const [ageFrom, setAgeFrom] = useState(detail.ageMinBirthYear != null ? String(detail.ageMinBirthYear) : "");
  const [ageTo, setAgeTo] = useState(detail.ageMaxBirthYear != null ? String(detail.ageMaxBirthYear) : "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const r = await uploadCommunityImageFile(philifeUploadImageUrl(), file, {
      network: t("moim_manage_upload_network_toast"),
      tooLarge: t("moim_manage_upload_too_large_toast"),
      failed: t("moim_manage_upload_failed_toast"),
    });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.ok) setCover(r.url);
    else toast.show(r.error, "error");
  };

  const save = async () => {
    const nameT = name.trim();
    const introT = intro.trim();
    if (nameT.length < NAME_MIN || nameT.length > NAME_MAX) return toast.showError("moim_name_length");
    if (introT.length < INTRO_MIN || introT.length > INTRO_MAX) return toast.showError("moim_intro_length");
    const cap = parseOptionalInt(capacity);
    if (cap === "invalid" || (cap != null && cap < 2)) return toast.showError("moim_capacity_invalid");
    const from = parseOptionalInt(ageFrom);
    const to = parseOptionalInt(ageTo);
    const yearOk = (y: number | null | "invalid") => y === null || (y !== "invalid" && y >= 1900 && y <= 2100);
    if (!yearOk(from) || !yearOk(to) || (typeof from === "number" && typeof to === "number" && from > to)) {
      return toast.show(t("moim_manage_info_age_invalid_toast"), "error");
    }
    const qs = questions.map((q) => q.trim()).filter(Boolean).slice(0, QUESTIONS_MAX);

    const patch: Patch = {};
    if (nameT !== detail.name) patch.name = nameT;
    if (introT !== detail.intro) patch.intro = introT;
    if (cover !== detail.coverImageUrl) patch.coverImageUrl = cover;
    if (categoryId && categoryId !== (detail.category?.id ?? null)) patch.categoryId = categoryId;
    if (cap !== detail.capacity) patch.capacity = cap;
    if (joinMode !== detail.joinMode) patch.joinMode = joinMode;
    if (!sameList(qs, detail.joinQuestions)) patch.questions = qs;
    if (from !== detail.ageMinBirthYear) patch.ageMinBirthYear = from as number | null;
    if (to !== detail.ageMaxBirthYear) patch.ageMaxBirthYear = to as number | null;
    if (Object.keys(patch).length === 0) return toast.show(t("moim_manage_info_no_change_toast"));

    setBusy(true);
    const r = await moimApi.updateInfo(detail.id, patch, detail.updatedAt);
    setBusy(false);
    if (!r.ok) {
      toast.showError(r.error);
      if (r.error === "moim_conflict") reload();
      return;
    }
    toast.show(t("moim_manage_info_saved_toast"), "success");
    reload();
  };

  const label = "block text-[13px] font-semibold text-sam-fg";
  const hint = "mt-1 text-[12px] text-sam-meta";
  const categoryLabel = (c: MoimCategoryDto) => c[language === "en" ? "labelEn" : "labelKo"];

  return (
    <div className="flex flex-col gap-5 px-4 pt-4">
      <section>
        <span className={label}>{t("moim_manage_info_cover_label")}</span>
        <div className={`${moimManageCardClass} mt-2 overflow-hidden`}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- 모임 대표 사진(업로드 URL)
            <img src={cover} alt="" className="aspect-[16/9] w-full bg-sam-surface-muted object-cover" />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center bg-sam-surface-muted text-[13px] text-sam-meta">
              {t("moim_manage_info_cover_empty")}
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={uploading}
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.btn.disabledToken} rounded-ui-rect`}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? t("moim_manage_info_cover_uploading") : t("moim_manage_info_cover_change_btn")}
          </button>
          {cover ? (
            <button type="button" className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} rounded-ui-rect`} onClick={() => setCover(null)}>
              {t("moim_manage_info_cover_remove_btn")}
            </button>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickFile(e.target.files?.[0])} />
      </section>

      <section>
        <label className={label} htmlFor="moim-info-name">
          {t("moim_manage_info_name_label")}
        </label>
        <input id="moim-info-name" className={`${moimManageInputClass} mt-2`} maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
        <p className={hint}>{t("moim_manage_info_length_hint", { min: NAME_MIN, max: NAME_MAX, count: name.trim().length })}</p>
      </section>

      <section>
        <label className={label} htmlFor="moim-info-intro">
          {t("moim_manage_info_intro_label")}
        </label>
        <textarea
          id="moim-info-intro"
          className={`${moimManageTextareaClass} mt-2 min-h-[140px]`}
          maxLength={INTRO_MAX}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
        />
        <p className={hint}>{t("moim_manage_info_length_hint", { min: INTRO_MIN, max: INTRO_MAX.toLocaleString(language), count: intro.trim().length })}</p>
      </section>

      <section>
        <span className={label}>{t("moim_manage_info_category_label")}</span>
        {categories.state.status === "ready" ? (
          <div className="-mx-4 mt-2 flex flex-nowrap gap-1.5 overflow-x-auto px-4 pb-1">
            {categories.state.data.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                className={`${categoryId === c.id ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} shrink-0 whitespace-nowrap rounded-ui-rect`}
                onClick={() => setCategoryId(c.id)}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
        ) : categories.state.status === "error" ? (
          <button type="button" className="mt-2 text-[13px] text-sam-primary underline" onClick={categories.reload}>
            {t("moim_manage_retry_btn")}
          </button>
        ) : (
          <p className={hint}>{t("moim_manage_loading")}</p>
        )}
      </section>

      <section>
        <label className={label} htmlFor="moim-info-capacity">
          {t("moim_manage_info_capacity_label")}
        </label>
        <input
          id="moim-info-capacity"
          inputMode="numeric"
          className={`${moimManageInputClass} mt-2`}
          value={capacity}
          placeholder={t("moim_manage_info_capacity_placeholder")}
          onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
        />
        <p className={hint}>{t("moim_manage_info_capacity_hint", { count: detail.memberCount })}</p>
      </section>

      <section>
        <span className={label}>{t("moim_manage_info_join_mode_label")}</span>
        <div className="mt-2 flex flex-col gap-2" role="radiogroup">
          {(["instant", "approval"] as const).map((m) => (
            <label
              key={m}
              className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-ui-rect border px-3 ${joinMode === m ? "border-sam-primary bg-sam-primary-soft" : "border-sam-border bg-sam-surface"}`}
            >
              <input type="radio" name="moim-join-mode" className="accent-[color:var(--sam-primary)]" checked={joinMode === m} onChange={() => setJoinMode(m)} />
              <span className="text-[15px] text-sam-fg">{t(m === "instant" ? "moim_join_mode_instant" : "moim_join_mode_approval")}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <span className={label}>{t("moim_manage_info_questions_label")}</span>
        <p className={`${Sam.badge.warning} mt-2 block whitespace-normal rounded-ui-rect px-3 py-2 text-[12px]`}>{t("moim_manage_info_questions_warning")}</p>
        <div className="mt-2 flex flex-col gap-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={`${moimManageInputClass} flex-1`}
                maxLength={QUESTION_MAX_LEN}
                value={q}
                placeholder={t("moim_manage_info_question_placeholder", { n: i + 1 })}
                onChange={(e) => setQuestions((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              />
              <button
                type="button"
                className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} shrink-0 rounded-ui-rect`}
                onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
              >
                {t("moim_manage_info_question_remove_btn")}
              </button>
            </div>
          ))}
          {questions.length < QUESTIONS_MAX ? (
            <button
              type="button"
              className={`${Sam.btn.outlineCombo} ${Sam.btn.sm} self-start rounded-ui-rect`}
              onClick={() => setQuestions((prev) => [...prev, ""])}
            >
              {t("moim_manage_info_question_add_btn")}
            </button>
          ) : null}
        </div>
        <p className={hint}>{t("moim_manage_info_questions_hint")}</p>
      </section>

      <section>
        <span className={label}>{t("moim_manage_info_age_label")}</span>
        <div className="mt-2 flex items-center gap-2">
          <input
            inputMode="numeric"
            aria-label={t("moim_manage_info_age_from_placeholder")}
            className={`${moimManageInputClass} flex-1`}
            value={ageFrom}
            placeholder={t("moim_manage_info_age_from_placeholder")}
            onChange={(e) => setAgeFrom(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          />
          <span aria-hidden className="text-sam-meta">
            ~
          </span>
          <input
            inputMode="numeric"
            aria-label={t("moim_manage_info_age_to_placeholder")}
            className={`${moimManageInputClass} flex-1`}
            value={ageTo}
            placeholder={t("moim_manage_info_age_to_placeholder")}
            onChange={(e) => setAgeTo(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          />
        </div>
        <p className={hint}>{t("moim_manage_info_age_hint")}</p>
      </section>

      <button
        type="button"
        disabled={busy || uploading}
        className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.btn.disabledToken} rounded-ui-rect`}
        onClick={() => void save()}
      >
        {t("moim_manage_save_btn")}
      </button>
      {toast.node}
    </div>
  );
}

export function MoimManageInfo({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_info_title" allow={(d) => d.can.edit_info}>
      {({ detail, reload }) => <InfoForm key={detail.updatedAt} detail={detail} reload={reload} />}
    </MoimManageFrame>
  );
}
