"use client";

/**
 * 「배달 화면 구성 › 배달 오픈 관리」 (Owner 「배달 on/off·매장 모집 배너」 2026-11-10 · 설계 v2 §6-1).
 * 정식 운영 / 매장 모집 전환, 기기별 배너 이미지(폰 4:3 · 와이드 2:1), 언어별 문구, 모집 팝업·고객센터 FAB,
 * 오픈 기념 무료 종료일, 기기별 미리보기, 변경 이력. 저장 = 최고관리자, 읽은 revision 으로만(409 시 덮어쓰지 않음).
 * 광고 배너·광고 팝업과 별개 저장소(`delivery_launch_settings`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { DeliveryRecruitingHeroLayout } from "@/components/delivery/launch/DeliveryRecruitingHeroLayout";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  DELIVERY_LAUNCH_IMAGE_SPECS,
  DELIVERY_LAUNCH_LOCALES,
  isDeliveryFreePromoActive,
  type DeliveryLaunchContent,
  type DeliveryLaunchImageKind,
  type DeliveryLaunchLocale,
  type DeliveryLaunchMode,
  type DeliveryLaunchPublicState,
  type DeliveryLaunchSettings,
  type DeliveryLaunchTexts,
} from "@/lib/delivery/launch/delivery-launch-contract";

type LogRow = {
  revision: number;
  actorId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
};

type LoadResponse = {
  ok: boolean;
  error?: string;
  settings?: DeliveryLaunchSettings;
  migrationApplied?: boolean;
  logs?: LogRow[];
  counts?: { visibleStores: number | null; visibleRealStores: number | null; pendingApplications: number | null };
};

type Draft = {
  mode: DeliveryLaunchMode;
  freeUntil: string;
  fabEnabled: boolean;
  content: DeliveryLaunchContent;
};

function draftFrom(s: DeliveryLaunchSettings): Draft {
  return { mode: s.mode, freeUntil: s.freeUntil ?? "", fabEnabled: s.fabEnabled, content: s.content };
}

/** UTC 저장값 → 표시만 필리핀 시각 */
function fmtPht(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ")} PHT`;
}

const TEXT_FIELDS: { key: keyof DeliveryLaunchTexts; label: MessageKey; multiline?: boolean }[] = [
  { key: "badge", label: "admin_dl_field_badge" },
  { key: "title", label: "admin_dl_field_title" },
  { key: "body", label: "admin_dl_field_body", multiline: true },
  { key: "schedule", label: "admin_dl_field_schedule" },
  { key: "applyLabel", label: "admin_dl_field_apply" },
  { key: "inquiryLabel", label: "admin_dl_field_inquiry" },
];

const IMAGE_FIELD: Record<DeliveryLaunchImageKind, "mobileImageUrl" | "wideImageUrl"> = {
  mobile: "mobileImageUrl",
  wide: "wideImageUrl",
};

const IMAGE_LABEL: Record<DeliveryLaunchImageKind, MessageKey> = {
  mobile: "admin_dl_image_mobile",
  wide: "admin_dl_image_wide",
};

const ERROR_KEY: Record<string, MessageKey> = {
  stale_revision: "admin_dl_err_stale_revision",
  super_admin_only: "admin_dl_err_super_admin_only",
  title_required_for_recruiting: "admin_dl_err_title_required",
  invalid_free_until: "admin_dl_err_free_until",
  migration_not_applied: "admin_dl_err_migration",
  image_too_small: "admin_dl_err_image_small",
  image_ratio_mismatch: "admin_dl_err_image_ratio",
  file_too_large: "admin_dl_err_file_large",
  invalid_type: "admin_dl_err_file_type",
};

function localeLabelKey(l: DeliveryLaunchLocale): MessageKey {
  return l === "en" ? "admin_dl_locale_en" : "admin_dl_locale_ko";
}

function PreviewHero({ state }: { state: DeliveryLaunchPublicState }) {
  return (
    <DeliveryRecruitingHeroLayout
      state={state}
      renderActions={({ applyLabel, inquiryLabel, applyClassName, inquiryClassName }) => (
        <>
          <span className={applyClassName}>{applyLabel}</span>
          <span className={inquiryClassName}>{inquiryLabel}</span>
        </>
      )}
    />
  );
}

export function DeliveryScreensLaunchTab() {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<LoadResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [revision, setRevision] = useState(0);
  const [locale, setLocale] = useState<DeliveryLaunchLocale>("ko");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<DeliveryLaunchImageKind | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const errText = useCallback(
    (code: string | undefined) => {
      const key = ERROR_KEY[code ?? ""];
      return key ? t(key) : `${t("admin_dl_failed")}${code ? ` (${code})` : ""}`;
    },
    [t]
  );

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/delivery-launch", { cache: "no-store" });
      const json = (await res.json()) as LoadResponse;
      setLoaded(json);
      if (json.ok && json.settings) {
        setDraft(draftFrom(json.settings));
        setRevision(json.settings.revision);
      }
    } catch {
      setLoaded({ ok: false, error: "network" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setText = (key: keyof DeliveryLaunchTexts, value: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            content: { ...d.content, texts: { ...d.content.texts, [locale]: { ...d.content.texts[locale], [key]: value } } },
          }
        : d
    );

  const upload = async (kind: DeliveryLaunchImageKind, file: File) => {
    setUploading(kind);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/admin/delivery-launch/upload-image", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string; width?: number; height?: number };
      if (!json.ok || !json.url) {
        const size = json.width && json.height ? ` (${json.width}×${json.height})` : "";
        setMessage({ tone: "error", text: `${errText(json.error)}${size}` });
        return;
      }
      const url = json.url;
      setDraft((d) => (d ? { ...d, content: { ...d.content, [IMAGE_FIELD[kind]]: url } } : d));
    } catch {
      setMessage({ tone: "error", text: errText("network") });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/delivery-launch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          mode: draft.mode,
          freeUntil: draft.freeUntil || null,
          fabEnabled: draft.fabEnabled,
          content: draft.content,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!json.ok) {
        setMessage({ tone: "error", text: errText(json.error) });
        return;
      }
      setMessage({ tone: "ok", text: t("admin_dl_saved", { rev: json.revision ?? 0 }) });
      await load();
    } catch {
      setMessage({ tone: "error", text: errText("network") });
    } finally {
      setSaving(false);
    }
  };

  const previewState = useMemo<DeliveryLaunchPublicState | null>(
    () =>
      draft
        ? {
            mode: "recruiting",
            freeUntil: draft.freeUntil || null,
            freePromoActive: isDeliveryFreePromoActive(draft.freeUntil || null),
              fabEnabled: draft.fabEnabled,
            content: draft.content,
          }
        : null,
    [draft]
  );

  if (!loaded) return <p className="py-6 text-[13px] text-sam-muted">{t("admin_dl_loading")}</p>;
  if (!loaded.ok || !draft) {
    return (
      <div className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px]">
        <p>{errText(loaded.error)}</p>
        <div>
          <AdminActionButton size="sm" onClick={() => void load()}>
            {t("admin_dl_refresh")}
          </AdminActionButton>
        </div>
      </div>
    );
  }

  const settings = loaded.settings;
  const texts = draft.content.texts[locale];
  const card = "grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" data-admin-delivery-launch="1">
      <div className="grid content-start gap-4">
        {loaded.migrationApplied === false ? (
          <p className="rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft px-3 py-2 text-[12px]">
            {t("admin_dl_migration_missing")}
          </p>
        ) : null}

        <section className={card}>
          <h3 className="text-[14px] font-bold">{t("admin_dl_status_title")}</h3>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["open", "recruiting"] as const).map((m) => (
              <AdminChipButton key={m} selected={draft.mode === m} onClick={() => setDraft({ ...draft, mode: m })}>
                <span className="grid gap-0.5 py-1 text-left" data-delivery-launch-mode={m}>
                  <b className="text-[13px]">{t(m === "open" ? "admin_dl_mode_open" : "admin_dl_mode_recruiting")}</b>
                  <span className="text-[12px] font-normal">
                    {t(m === "open" ? "admin_dl_mode_open_desc" : "admin_dl_mode_recruiting_desc")}
                  </span>
                </span>
              </AdminChipButton>
            ))}
          </div>
          <p className="text-[12px] text-sam-muted">{t("admin_dl_mode_note")}</p>
        </section>

        <section className={card}>
          <h3 className="text-[14px] font-bold">{t("admin_dl_images_title")}</h3>
          {(["mobile", "wide"] as const).map((kind) => {
            const spec = DELIVERY_LAUNCH_IMAGE_SPECS[kind];
            const url = draft.content[IMAGE_FIELD[kind]];
            return (
              <div key={kind} className="flex min-w-0 items-center gap-3 rounded-ui-rect border border-dashed border-sam-border p-2.5">
                <div
                  className="h-[54px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted"
                  style={{ aspectRatio: `${spec.ratioW} / ${spec.ratioH}` }}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 text-[12px]">
                  <b>{t(IMAGE_LABEL[kind])}</b>
                  <p className="text-sam-muted">
                    {t("admin_dl_image_spec", {
                      ratio: spec.ratioLabel,
                      rw: spec.recommendedWidth,
                      rh: spec.recommendedHeight,
                      mw: spec.minWidth,
                      mh: spec.minHeight,
                    })}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <label className="cursor-pointer text-[13px] text-[var(--admin-console-accent)] underline">
                      {uploading === kind ? t("admin_dl_uploading") : url ? t("admin_dl_replace") : t("admin_dl_upload")}
                      <input
                        id={`delivery-launch-upload-${kind}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploading != null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void upload(kind, f);
                        }}
                      />
                    </label>
                    {url ? (
                      <AdminActionButton
                        size="sm"
                        variant="quiet"
                        onClick={() => setDraft({ ...draft, content: { ...draft.content, [IMAGE_FIELD[kind]]: "" } })}
                      >
                        {t("admin_dl_remove")}
                      </AdminActionButton>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[12px] text-sam-muted">{t("admin_dl_images_note")}</p>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-bold">{t("admin_dl_copy_title")}</h3>
            <div className="flex gap-1">
              {DELIVERY_LAUNCH_LOCALES.map((l) => (
                <AdminChipButton key={l} selected={locale === l} onClick={() => setLocale(l)}>
                  {t(localeLabelKey(l))}
                </AdminChipButton>
              ))}
            </div>
          </div>
          {locale === "en" ? <p className="text-[12px] text-sam-muted">{t("admin_dl_copy_en_note")}</p> : null}
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className="grid gap-1 text-[12px] text-sam-muted">
              {t(f.label)}
              {f.multiline ? (
                <textarea
                  id={`delivery-launch-${locale}-${f.key}`}
                  rows={2}
                  value={texts[f.key]}
                  onChange={(e) => setText(f.key, e.target.value)}
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2 text-[13px] text-sam-fg"
                />
              ) : (
                <input
                  id={`delivery-launch-${locale}-${f.key}`}
                  value={texts[f.key]}
                  onChange={(e) => setText(f.key, e.target.value)}
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2 text-[13px] text-sam-fg"
                />
              )}
            </label>
          ))}
        </section>

        <section className={card}>
          <h3 className="text-[14px] font-bold">{t("admin_dl_fab_title")}</h3>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>{t("admin_dl_fab_toggle")}</span>
            <input
              id="delivery-launch-fab-enabled"
              type="checkbox"
              checked={draft.fabEnabled}
              onChange={(e) => setDraft({ ...draft, fabEnabled: e.target.checked })}
            />
          </label>
        </section>

        <section className={card}>
          <h3 className="text-[14px] font-bold">{t("admin_dl_free_title")}</h3>
          <label className="grid gap-1 text-[12px] text-sam-muted">
            {t("admin_dl_free_label")}
            <input
              id="delivery-launch-free-until"
              type="date"
              value={draft.freeUntil}
              onChange={(e) => setDraft({ ...draft, freeUntil: e.target.value })}
              className="w-fit rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2 text-[13px] text-sam-fg"
            />
          </label>
          <p className="text-[12px] text-sam-muted">{t("admin_dl_free_note")}</p>
        </section>

        {message ? (
          <p
            role="status"
            className={`rounded-ui-rect px-3 py-2 text-[13px] ${message.tone === "ok" ? "bg-sam-primary-soft text-sam-primary" : "bg-sam-warning-soft text-sam-fg"}`}
          >
            {message.text}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <AdminActionButton onClick={() => settings && setDraft(draftFrom(settings))} disabled={saving}>
            {t("admin_dl_revert")}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            onClick={() => void save()}
            disabled={saving || loaded.migrationApplied === false}
            data-delivery-launch-save
          >
            {saving ? t("admin_dl_saving") : t("admin_dl_save")}
          </AdminActionButton>
        </div>
        <p className="text-[12px] text-sam-muted">
          {settings?.updatedAt
            ? t("admin_dl_revision_line_saved", { rev: revision, at: fmtPht(settings.updatedAt) })
            : t("admin_dl_revision_line", { rev: revision })}
        </p>
      </div>

      <div className="grid content-start gap-4">
        <section className={card}>
          <h3 className="text-[14px] font-bold">{t("admin_dl_preview_title")}</h3>
          {previewState ? (
            <div className="grid gap-3 overflow-x-auto">
              <div>
                <p className="mb-1 text-[12px] text-sam-muted">{t("admin_dl_preview_phone")}</p>
                <div className="w-[343px] max-w-full" inert>
                  <PreviewHero state={previewState} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[12px] text-sam-muted">
                  {t(draft.content.wideImageUrl ? "admin_dl_preview_wide" : "admin_dl_preview_wide_cropped")}
                </p>
                <div className="w-[736px]" inert>
                  <PreviewHero state={previewState} />
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px]">
          <h3 className="text-[14px] font-bold">{t("admin_dl_counts_title")}</h3>
          <p>
            {t("admin_dl_counts_visible", {
              n: loaded.counts?.visibleStores ?? "—",
              real: loaded.counts?.visibleRealStores ?? "—",
            })}
          </p>
          <p>{t("admin_dl_counts_pending", { n: loaded.counts?.pendingApplications ?? "—" })}</p>
          <p>
            {t("admin_dl_counts_saved_mode", {
              mode: t(settings?.mode === "recruiting" ? "admin_dl_mode_recruiting" : "admin_dl_mode_open"),
            })}
          </p>
        </section>

        <section className="grid gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[12px]">
          <h3 className="text-[14px] font-bold">{t("admin_dl_history_title")}</h3>
          {(loaded.logs ?? []).length === 0 ? (
            <p className="text-sam-muted">{t("admin_dl_history_empty")}</p>
          ) : (
            (loaded.logs ?? []).map((l) => (
              <div key={l.revision} className="flex flex-wrap justify-between gap-2 border-b border-dashed border-sam-border pb-1">
                <span>
                  r{l.revision} · {String(l.before.mode ?? "—")} → {String(l.after.mode ?? "—")}
                  {l.before.free_until !== l.after.free_until
                    ? ` · ${t("admin_dl_history_free", { date: String(l.after.free_until ?? "—") })}`
                    : ""}
                </span>
                <span className="font-mono text-sam-muted">
                  {fmtPht(l.createdAt)} · {l.actorId ? formatAdminShortId(l.actorId) : "—"}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
