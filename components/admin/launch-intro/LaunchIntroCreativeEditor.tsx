"use client";

/**
 * 앱 진입 어드민 v3 §2 — 인트로 만들기·수정(목록 대신 전체 폭). 왼쪽 번호 순서 8칸, 오른쪽 기기 3종 미리보기.
 * ① 종류 ② 이름 ③ 그림(공통 그림 칸 INTRO_POOL_SLOT · 업로드 2단계 후 만들기) ④ 배경색(+ 그림에서 고르기)
 * ⑤ 표시 시간 1~5초 ⑥ 누르면 이동(없음·이벤트·매장·앱 화면·외부 링크) ⑦ 「광고」 표기(종류 광고면 켬 고정) ⑧ 기간(PHT).
 * 저장 (꺼진 채) / 저장하고 켜기. 입력 검사는 서버와 같은 `validateLaunchIntroPoolInput`.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { FeedAdStoreDestinationPicker } from "@/components/admin/feed-ads/FeedAdStoreDestinationPicker";
import { LaunchIntroDevicePreview } from "@/components/admin/launch-intro/LaunchIntroDevicePreview";
import { LaunchIntroEventPicker } from "@/components/admin/launch-intro/LaunchIntroEventPicker";
import {
  LAUNCH_INTRO_POOL_API,
  launchIntroPoolErrorText,
  launchIntroPoolRequest,
  pickLaunchIntroBorderColor,
  uploadLaunchIntroDraftImage,
} from "@/components/admin/launch-intro/launch-intro-pool-client";
import { AdminImageSlot } from "@/components/admin/media/AdminImageSlot";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { INTRO_POOL_SLOT } from "@/lib/admin/media/image-slot-spec";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  LAUNCH_INTRO_POOL_DURATION_DEFAULT_MS,
  LAUNCH_INTRO_POOL_DURATION_MAX_MS,
  LAUNCH_INTRO_POOL_DURATION_MIN_MS,
  LAUNCH_INTRO_POOL_KINDS,
  LAUNCH_INTRO_POOL_NAME_MAX,
  validateLaunchIntroPoolInput,
  type LaunchIntroPoolKind,
} from "@/lib/launch-intro/pool";
import {
  LAUNCH_INTRO_CTA_TYPES,
  LAUNCH_INTRO_POOL_DEFAULT_BG,
  buildLaunchIntroCtaHref,
  isLaunchIntroHex,
  parseLaunchIntroCtaHref,
  type LaunchIntroCtaType,
  type LaunchIntroPoolAdminItem,
} from "@/lib/launch-intro/pool-admin-view";
import { isoToManilaLocal, manilaLocalToIso } from "@/lib/launch-intro/schedule";

export const LAUNCH_INTRO_KIND_KEY: Record<LaunchIntroPoolKind, MessageKey> = {
  ad: "admin_launch_intro_v3_kind_ad",
  event: "admin_launch_intro_v3_kind_event",
  notice: "admin_launch_intro_v3_kind_notice",
};

export const LAUNCH_INTRO_CTA_KEY: Record<LaunchIntroCtaType, MessageKey> = {
  none: "admin_launch_intro_v3_cta_none",
  event: "admin_launch_intro_v3_cta_event",
  store: "admin_launch_intro_v3_cta_store",
  screen: "admin_launch_intro_v3_cta_screen",
  external: "admin_launch_intro_v3_cta_external",
};

const DURATIONS: number[] = [];
for (let ms = LAUNCH_INTRO_POOL_DURATION_MIN_MS; ms <= LAUNCH_INTRO_POOL_DURATION_MAX_MS; ms += 1000) DURATIONS.push(ms);

const INPUT = "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";

function Field({ n, label, help, children }: { n: number; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5" data-launch-intro-field={n}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sam-primary text-[12px] font-bold text-sam-on-primary">
          {n}
        </span>
        <span className="sam-text-body font-semibold text-sam-fg">{label}</span>
        {help ? <span className="sam-text-helper text-sam-muted">{help}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function LaunchIntroCreativeEditor({
  item,
  nextSortOrder,
  canWrite,
  onDone,
  onCancel,
}: {
  /** null = 새 인트로 */
  item: LaunchIntroPoolAdminItem | null;
  nextSortOrder: number;
  canWrite: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const initialCta = parseLaunchIntroCtaHref(item?.cta_href);
  const [kind, setKind] = useState<LaunchIntroPoolKind>(item?.kind ?? "ad");
  const [name, setName] = useState(item?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<{ width: number; height: number } | null>(null);
  const [bg, setBg] = useState(item?.background_color ?? LAUNCH_INTRO_POOL_DEFAULT_BG);
  const [durationMs, setDurationMs] = useState(item?.duration_ms ?? LAUNCH_INTRO_POOL_DURATION_DEFAULT_MS);
  const [ctaType, setCtaType] = useState<LaunchIntroCtaType>(initialCta.type);
  const [ctaValues, setCtaValues] = useState<Record<LaunchIntroCtaType, string>>(() => ({
    none: "",
    event: "",
    store: "",
    screen: "",
    external: "",
    [initialCta.type]: initialCta.value,
  }));
  const [adLabel, setAdLabel] = useState(item?.show_ad_label ?? true);
  const [startLocal, setStartLocal] = useState(item?.start_at ? isoToManilaLocal(item.start_at) : "");
  const [endLocal, setEndLocal] = useState(item?.end_at ? isoToManilaLocal(item.end_at) : "");
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [pickNotice, setPickNotice] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl]
  );

  const effectiveAdLabel = kind === "ad" ? true : adLabel;
  const imageUrl = fileUrl ?? item?.image_url ?? null;
  const imageSize = fileSize ?? (item ? { width: item.image_width, height: item.image_height } : null);
  const disabled = !canWrite || busy !== null;

  const body = useMemo(() => {
    const startAt = manilaLocalToIso(startLocal);
    const endAt = manilaLocalToIso(endLocal);
    return {
      name: name.trim(),
      kind,
      backgroundColor: bg.trim().toUpperCase(),
      durationMs,
      ctaHref: buildLaunchIntroCtaHref(ctaType, ctaValues[ctaType]),
      showAdLabel: effectiveAdLabel,
      startAt: startAt === undefined ? "invalid" : startAt,
      endAt: endAt === undefined ? "invalid" : endAt,
    };
  }, [name, kind, bg, durationMs, ctaType, ctaValues, effectiveAdLabel, startLocal, endLocal]);

  const save = async (turnOn: boolean) => {
    setError(null);
    if (!item && !file) return setError(launchIntroPoolErrorText("image_required", t));
    if (ctaType !== "none" && !body.ctaHref) return setError(launchIntroPoolErrorText("cta_pick_required", t));
    const pre = validateLaunchIntroPoolInput(body, { partial: false });
    if (!pre.ok) return setError(launchIntroPoolErrorText(pre.error, t));
    const wasActive = item?.status === "active";
    if (turnOn || wasActive) {
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko,
        title: turnOn ? t("admin_launch_intro_v3_save_on_title") : t("admin_launch_intro_v3_save_off_active_title"),
        description: turnOn ? t("admin_launch_intro_v3_switch_on_desc") : t("admin_launch_intro_v3_switch_off_desc"),
        confirmLabel: turnOn ? t("admin_launch_intro_v3_save_on") : t("admin_launch_intro_v3_save_off"),
      });
      if (!confirmed.ok) return;
    }
    const status = turnOn ? "active" : "paused";
    let res;
    if (item) {
      setBusy("save");
      res = await launchIntroPoolRequest(`${LAUNCH_INTRO_POOL_API}/${item.id}`, "PATCH", {
        ...body,
        status,
        expectedUpdatedAt: item.updated_at,
      });
    } else {
      setBusy("upload");
      let draftPath: string;
      try {
        draftPath = await uploadLaunchIntroDraftImage(file as File);
      } catch (e) {
        setBusy(null);
        return setError(launchIntroPoolErrorText(e instanceof Error ? e.message : "save_failed", t));
      }
      setBusy("save");
      res = await launchIntroPoolRequest(LAUNCH_INTRO_POOL_API, "POST", {
        ...body,
        status,
        draftPath,
        sortOrder: nextSortOrder,
      });
    }
    setBusy(null);
    if (!res.ok) return setError(launchIntroPoolErrorText(res.error, t));
    onDone(turnOn ? t("admin_launch_intro_v3_saved_on") : t("admin_launch_intro_v3_saved_off"));
  };

  const pickFromImage = async () => {
    setPickNotice(null);
    if (!imageUrl) return;
    const hex = await pickLaunchIntroBorderColor(imageUrl);
    if (hex) setBg(hex);
    else setPickNotice(t("admin_launch_intro_v3_f_bg_pick_failed"));
  };

  return (
    <AdminCard>
      <div className="space-y-4 px-4 py-4 sm:px-5" data-launch-intro-editor={item ? "edit" : "new"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sam-text-section-title font-semibold text-sam-fg">
            {item ? t("admin_launch_intro_v3_editor_title_edit") : t("admin_launch_intro_v3_editor_title_new")}
          </h2>
          <AdminActionButton variant="secondary" size="sm" onClick={onCancel} disabled={busy !== null}>
            {t("admin_launch_intro_v3_back")}
          </AdminActionButton>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="space-y-4">
            <Field n={1} label={t("admin_launch_intro_v3_f_kind")}>
              <div className="flex flex-wrap gap-2">
                {LAUNCH_INTRO_POOL_KINDS.map((k) => (
                  <AdminChipButton key={k} selected={kind === k} disabled={disabled} onClick={() => setKind(k)} data-launch-intro-kind={k}>
                    {t(LAUNCH_INTRO_KIND_KEY[k])}
                  </AdminChipButton>
                ))}
              </div>
            </Field>

            <Field n={2} label={t("admin_launch_intro_v3_f_name")} help={t("admin_launch_intro_v3_f_name_help")}>
              <div className="relative">
                <input
                  className={`${INPUT} pr-16`}
                  value={name}
                  maxLength={LAUNCH_INTRO_POOL_NAME_MAX}
                  disabled={disabled}
                  onChange={(e) => setName(e.target.value)}
                  data-launch-intro-name=""
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 sam-text-helper tabular-nums text-sam-muted">
                  {name.length}/{LAUNCH_INTRO_POOL_NAME_MAX}
                </span>
              </div>
            </Field>

            <Field n={3} label={t("admin_launch_intro_v3_f_image")}>
              {item ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-ui-rect border border-sam-border p-2">
                    <div className="flex h-24 w-14 shrink-0 items-center justify-center overflow-hidden rounded-ui-rect" style={{ background: bg }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기 */}
                      <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                    <span className="sam-text-helper tabular-nums text-sam-muted">
                      {item.image_width} × {item.image_height}px
                    </span>
                  </div>
                  <p className="sam-text-helper text-sam-muted">{t("admin_launch_intro_v3_f_image_locked")}</p>
                </div>
              ) : (
                <AdminImageSlot
                  spec={INTRO_POOL_SLOT}
                  disabled={disabled}
                  onAccept={(f, meta) => {
                    setFile(f);
                    setFileSize({ width: meta.width, height: meta.height });
                    setFileUrl(URL.createObjectURL(f));
                  }}
                  onReject={() => {
                    // 빌드 전 감사 I5: 검사에 걸린 파일을 고르면 전에 받아 둔 파일도 놓는다(저장이 이전 파일을 올리지 않게)
                    setFile(null);
                    setFileSize(null);
                    setFileUrl(null);
                  }}
                />
              )}
            </Field>

            <Field n={4} label={t("admin_launch_intro_v3_f_bg")} help={t("admin_launch_intro_v3_f_bg_help")}>
              <div className="flex items-center gap-2">
                <span
                  className="h-9 w-9 shrink-0 rounded-ui-rect border border-sam-border"
                  style={{ background: isLaunchIntroHex(bg) ? bg : "transparent" }}
                  data-launch-intro-bg-swatch=""
                />
                <input
                  className={`${INPUT} font-mono`}
                  value={bg}
                  maxLength={7}
                  placeholder="#RRGGBB"
                  disabled={disabled}
                  onChange={(e) => setBg(e.target.value)}
                  data-launch-intro-bg=""
                />
                <AdminActionButton variant="secondary" size="sm" disabled={disabled || !imageUrl} onClick={() => void pickFromImage()}>
                  {t("admin_launch_intro_v3_f_bg_pick")}
                </AdminActionButton>
              </div>
              {pickNotice ? <p className="sam-text-helper text-sam-warning">{pickNotice}</p> : null}
            </Field>

            <Field n={5} label={t("admin_launch_intro_v3_f_duration")}>
              <div className="flex flex-wrap items-center gap-2">
                {DURATIONS.map((ms) => (
                  <AdminChipButton key={ms} selected={durationMs === ms} disabled={disabled} onClick={() => setDurationMs(ms)}>
                    {t("admin_launch_intro_pool_seconds", { seconds: ms / 1000 })}
                  </AdminChipButton>
                ))}
                <span className="sam-text-helper text-sam-muted">{t("admin_launch_intro_v3_f_duration_help")}</span>
              </div>
            </Field>

            <Field n={6} label={t("admin_launch_intro_v3_f_cta")}>
              <div className="flex flex-wrap gap-2">
                {LAUNCH_INTRO_CTA_TYPES.map((c) => (
                  <AdminChipButton key={c} selected={ctaType === c} disabled={disabled} onClick={() => setCtaType(c)} data-launch-intro-cta={c}>
                    {t(LAUNCH_INTRO_CTA_KEY[c])}
                  </AdminChipButton>
                ))}
              </div>
              {ctaType === "event" ? (
                <LaunchIntroEventPicker
                  value={ctaValues.event}
                  disabled={disabled}
                  onChange={(id) => setCtaValues((v) => ({ ...v, event: id }))}
                />
              ) : null}
              {ctaType === "store" ? (
                <FeedAdStoreDestinationPicker
                  value={ctaValues.store}
                  disabled={disabled}
                  onChange={(slug) => setCtaValues((v) => ({ ...v, store: slug }))}
                />
              ) : null}
              {ctaType === "screen" || ctaType === "external" ? (
                <div className="space-y-1">
                  <input
                    className={INPUT}
                    value={ctaValues[ctaType]}
                    maxLength={500}
                    placeholder={ctaType === "screen" ? "/stores" : "https://"}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCtaValues((cur) => ({ ...cur, [ctaType]: v }));
                    }}
                  />
                  <p className="sam-text-helper text-sam-muted">
                    {ctaType === "screen" ? t("admin_launch_intro_v3_f_cta_screen_help") : t("admin_launch_intro_v3_f_cta_external_help")}
                  </p>
                </div>
              ) : null}
            </Field>

            <Field n={7} label={t("admin_launch_intro_v3_f_ad_label")}>
              <div className="flex items-center gap-2">
                <AdminSwitch
                  checked={effectiveAdLabel}
                  disabled={disabled || kind === "ad"}
                  onChange={setAdLabel}
                  label={t("admin_launch_intro_v3_f_ad_label")}
                />
                <span className="sam-text-body text-sam-fg">
                  {effectiveAdLabel ? t("admin_launch_intro_v3_f_ad_label_on") : t("admin_launch_intro_v3_f_ad_label_off")}
                </span>
                {kind === "ad" ? <span className="sam-text-helper text-sam-muted">({t("admin_launch_intro_v3_f_ad_label_forced")})</span> : null}
              </div>
            </Field>

            <Field n={8} label={t("admin_launch_intro_v3_f_period")} help={t("admin_launch_intro_v3_f_period_help")}>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 sam-text-helper text-sam-muted">
                  {t("admin_launch_intro_v3_f_start")} (PHT)
                  <input type="datetime-local" className={INPUT} value={startLocal} disabled={disabled} onChange={(e) => setStartLocal(e.target.value)} />
                </label>
                <label className="space-y-1 sam-text-helper text-sam-muted">
                  {t("admin_launch_intro_v3_f_end")} (PHT)
                  <input type="datetime-local" className={INPUT} value={endLocal} disabled={disabled} onChange={(e) => setEndLocal(e.target.value)} />
                </label>
              </div>
            </Field>

            {error ? (
              <p role="alert" className="rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-body text-sam-danger" data-launch-intro-editor-error="">
                {error}
              </p>
            ) : null}
            {busy === "upload" ? <p className="sam-text-helper text-sam-muted">{t("admin_launch_intro_v3_uploading")}</p> : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-sam-border pt-3">
              <AdminActionButton variant="secondary" disabled={busy !== null} onClick={onCancel}>
                {adminCta("cancel", ko)}
              </AdminActionButton>
              <AdminActionButton variant="secondary" disabled={disabled} onClick={() => void save(false)} data-launch-intro-save-off="">
                {t("admin_launch_intro_v3_save_off")}
              </AdminActionButton>
              <AdminActionButton variant="primary" disabled={disabled} onClick={() => void save(true)} data-launch-intro-save-on="">
                {t("admin_launch_intro_v3_save_on")}
              </AdminActionButton>
            </div>
          </div>

          <div className="min-w-0">
            <LaunchIntroDevicePreview
              imageUrl={imageUrl}
              imageSize={imageSize}
              backgroundColor={isLaunchIntroHex(bg) ? bg : LAUNCH_INTRO_POOL_DEFAULT_BG}
              showAdLabel={effectiveAdLabel}
              durationMs={durationMs}
            />
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
