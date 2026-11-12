"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimErrorKey, moimRoutes, type MoimScheduleClientInput } from "@/lib/moim/moim-client-api";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { useMoimImageUpload } from "@/components/moim/use-moim-image-upload";
import { formatMoimScheduleWhen } from "@/components/moim/moim-schedule-ui";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";

const TITLE_MAX = 60;
const PLACE_MAX = 120;
const DESC_MAX = 3000;
const MAX_IMAGES = 10;

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → 기기 시간대의 날짜·시각 입력값 */
function isoToLocalInputs(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** 기기 시간대의 날짜·시각 입력값 → ISO (잘못되면 null) */
function localInputsToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

/** 일정 만들기·수정 /moim/[id]/schedules/new · /moim/[id]/schedules/[sid]/edit (설계 §6 P10) */
export function MoimScheduleFormScreen({ moimId, scheduleId }: { moimId: string; scheduleId?: string | null }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useMoimToast();
  const { uploading, upload } = useMoimImageUpload();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { moim, error, reload } = useMoimDetail(moimId);
  const editing = !!scheduleId;

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [capacity, setCapacity] = useState("");
  const [joinMode, setJoinMode] = useState<"first_come" | "approval">("first_come");
  const [askMotivation, setAskMotivation] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(!editing);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const backHref = scheduleId ? moimRoutes.schedule(moimId, scheduleId) : moimRoutes.schedules(moimId);
  const header = useMemo(
    () => ({ titleText: editing ? t("moim_schedule_edit_title") : t("moim_schedule_new_title"), backHref }),
    [backHref, editing, t]
  );
  useRegisterMainTier1Header(header);

  useEffect(() => {
    if (!scheduleId) return;
    let alive = true;
    void moimApi.schedule(scheduleId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      const s = r.schedule;
      const start = isoToLocalInputs(s.startsAt);
      const end = isoToLocalInputs(s.endsAt);
      setTitle(s.title);
      setStartDate(start.date);
      setStartTime(start.time);
      setEndDate(end.date);
      setEndTime(end.time);
      setPlace(s.placeText);
      setDescription(s.description);
      setImages(s.images);
      setCapacity(s.capacity ? String(s.capacity) : "");
      setJoinMode(s.joinMode);
      setAskMotivation(s.askMotivation);
      setCanEdit(s.viewer.canManage && s.status !== "done" && s.status !== "cancelled");
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [scheduleId]);

  const startIso = localInputsToIso(startDate, startTime);
  const endIso = endTime ? localInputsToIso(endDate || startDate, endTime) : null;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return toast.show(t("moim_err_moim_post_images_invalid"), "error");
    const r = await upload(files.slice(0, room));
    if (r.urls.length) setImages((xs) => [...xs, ...r.urls].slice(0, MAX_IMAGES));
    if (r.failed) toast.show(t("moim_screen_upload_failed"), "error");
    if (files.length > room) toast.show(t("moim_err_moim_post_images_invalid"), "error");
  };

  /** 화면 검사 — 문구는 서버 오류 코드와 같은 키 */
  const validate = (nowMs: number): { input: MoimScheduleClientInput } | { error: MessageKey } => {
    const tt = title.trim();
    if (!tt || [...tt].length > TITLE_MAX) return { error: moimErrorKey("moim_schedule_title_invalid") };
    if (!startIso) return { error: moimErrorKey("moim_schedule_time_invalid") };
    if (!editing && Date.parse(startIso) <= nowMs) return { error: moimErrorKey("moim_schedule_time_invalid") };
    if ((endDate || endTime) && !endIso) return { error: moimErrorKey("moim_schedule_time_invalid") };
    if (endIso && Date.parse(endIso) <= Date.parse(startIso)) return { error: moimErrorKey("moim_schedule_time_invalid") };
    if ([...place.trim()].length > PLACE_MAX || [...description.trim()].length > DESC_MAX) return { error: moimErrorKey("moim_schedule_too_long") };
    if (images.length > MAX_IMAGES) return { error: moimErrorKey("moim_post_images_invalid") };
    let cap: number | null = null;
    if (capacity.trim()) {
      const n = Number(capacity.trim());
      if (!Number.isInteger(n) || n < 2) return { error: moimErrorKey("moim_capacity_invalid") };
      cap = n;
    }
    return {
      input: {
        title: tt,
        startsAt: startIso,
        endsAt: endIso,
        placeText: place.trim(),
        description: description.trim(),
        images,
        capacity: cap,
        joinMode,
        askMotivation: joinMode === "approval" ? askMotivation : false,
      },
    };
  };

  const submit = async () => {
    if (busy || uploading) return;
    const v = validate(new Date().getTime());
    if ("error" in v) {
      setSubmitError(t(v.error));
      return;
    }
    setBusy(true);
    setSubmitError(null);
    if (scheduleId) {
      const r = await moimApi.updateSchedule(scheduleId, v.input);
      setBusy(false);
      if (!r.ok) return setSubmitError(t(moimErrorKey(r.error)));
      router.replace(moimRoutes.schedule(moimId, scheduleId));
      return;
    }
    const r = await moimApi.createSchedule(moimId, v.input);
    setBusy(false);
    if (!r.ok) return setSubmitError(t(moimErrorKey(r.error)));
    router.replace(moimRoutes.schedule(moimId, r.schedule_id));
  };

  if (error || loadError) {
    const e = (error ?? loadError) as string;
    return (
      <div className={moimCls.page}>
        <MoimErrorState messageKey={moimErrorKey(e)} onRetry={error ? reload : undefined} />
      </div>
    );
  }
  if (!moim || !loaded) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={2} />
      </div>
    );
  }
  if (moim.viewer.status !== "active") {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_err_moim_not_member")}</MoimEmptyState>
      </div>
    );
  }
  if ((!editing && !moim.can.create_schedule) || (editing && !canEdit)) {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_schedule_form_no_permission")}</MoimEmptyState>
      </div>
    );
  }

  const preview = startIso ? formatMoimScheduleWhen(startIso, language) : "";

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <div className={`${moimCls.column} grid flex-1 content-start gap-4 px-4 pb-28 pt-3`}>
        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_title_label")}</span>
          <input
            className={moimCls.input}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("moim_schedule_form_title_placeholder")}
          />
          <span className={`${moimCls.hint} text-right`}>
            {[...title].length}/{TITLE_MAX}
          </span>
        </label>

        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_start_label")}</span>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input type="date" className={moimCls.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label={t("moim_schedule_form_date_aria")} />
            <input type="time" className={moimCls.input} value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label={t("moim_schedule_form_time_aria")} />
          </div>
          {preview ? <span className={moimCls.hint}>{t("moim_schedule_form_pht_preview", { time: preview })}</span> : null}
        </div>

        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_end_label")}</span>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="date"
              className={moimCls.input}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label={t("moim_schedule_form_end_date_aria")}
            />
            <input
              type="time"
              className={moimCls.input}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label={t("moim_schedule_form_end_time_aria")}
            />
          </div>
          {endDate || endTime ? (
            <button
              type="button"
              className="justify-self-start text-[12px] text-sam-muted underline"
              onClick={() => {
                setEndDate("");
                setEndTime("");
              }}
            >
              {t("moim_schedule_form_end_clear_btn")}
            </button>
          ) : null}
        </div>

        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_place_label")}</span>
          <input
            className={moimCls.input}
            value={place}
            maxLength={PLACE_MAX}
            onChange={(e) => setPlace(e.target.value)}
            placeholder={t("moim_schedule_form_place_placeholder")}
          />
        </label>

        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_desc_label")}</span>
          <textarea
            className={`${moimCls.textarea} min-h-[140px]`}
            value={description}
            maxLength={DESC_MAX}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("moim_schedule_form_desc_placeholder")}
          />
        </label>

        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_write_photos_label", { count: images.length, max: MAX_IMAGES })}</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.length < MAX_IMAGES ? (
              <button
                type="button"
                disabled={uploading}
                className={`${moimCls.card} flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 text-[11px] text-sam-muted`}
                onClick={() => fileRef.current?.click()}
                aria-label={t("moim_write_add_photo_aria")}
              >
                <ImagePlus className="h-5 w-5" aria-hidden />
                {uploading ? t("common_loading") : null}
              </button>
            ) : null}
            {images.map((u, i) => (
              <div key={`${u}-${i}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-sam-surface text-sam-fg shadow"
                  aria-label={t("moim_write_remove_photo_aria")}
                  onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        </div>

        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_capacity_label")}</span>
          <input
            className={moimCls.input}
            type="number"
            inputMode="numeric"
            min={2}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t("moim_schedule_form_capacity_placeholder")}
          />
          <span className={moimCls.hint}>{t("moim_schedule_form_capacity_hint")}</span>
        </label>

        <div className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_schedule_form_join_mode_label")}</span>
          <div className="flex overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface" role="radiogroup">
            {(["first_come", "approval"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={joinMode === v}
                className={`flex-1 py-2.5 text-[13px] ${joinMode === v ? "bg-sam-primary-soft font-bold text-sam-primary" : "text-sam-fg"}`}
                onClick={() => setJoinMode(v)}
              >
                {v === "first_come" ? t("moim_schedule_first_come_segment") : t("moim_schedule_approval_segment")}
              </button>
            ))}
          </div>
          <span className={moimCls.hint}>
            {joinMode === "first_come" ? t("moim_schedule_first_come_hint") : t("moim_schedule_approval_hint")}
          </span>
        </div>

        {joinMode === "approval" ? (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className={`${moimCls.label} block`}>{t("moim_schedule_form_ask_motivation_label")}</span>
              <span className={`${moimCls.hint} block`}>{t("moim_schedule_form_ask_motivation_hint")}</span>
            </span>
            <MoimSwitch checked={askMotivation} onChange={setAskMotivation} label={t("moim_schedule_form_ask_motivation_label")} />
          </div>
        ) : null}

        {submitError ? <p className={moimCls.noticeBad}>{submitError}</p> : null}
      </div>
      <MoimStickyFooter>
        <div className={moimCls.column}>
          <button type="button" className={`${moimCls.btnPrimary} w-full`} disabled={!title.trim() || !startDate || !startTime || busy || uploading} onClick={submit}>
            {editing ? t("common_save") : t("moim_schedule_form_submit_btn")}
          </button>
        </div>
      </MoimStickyFooter>
      {toast.node}
    </div>
  );
}

/** 켜기/끄기 스위치 (모임 화면 공용) */
export function MoimSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-sam-primary" : "bg-sam-border"
      }`}
    >
      <span
        className={`inline-block h-[27px] w-[27px] rounded-full bg-sam-surface shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-[2px]"}`}
        aria-hidden
      />
    </button>
  );
}
