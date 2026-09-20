"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPlatformEventDistributionPanel } from "@/components/admin/platform-events/AdminPlatformEventDistributionPanel";
import { PlatformEventDetailContent } from "@/components/platform-events/PlatformEventDetailContent";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolveEventOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import type {
  PlatformEventRow,
  PlatformEventSection,
  PlatformEventStatus,
} from "@/lib/platform-events/types";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";

type Props = { eventId: string | null };

type PreviewTab = "event" | "popup" | "banner";

const CTA_TYPE_OPTIONS = [
  { value: "internal_page", ko: "앱 내부 페이지", en: "In-app page" },
  { value: "store", ko: "매장", en: "Store" },
  { value: "trade_listing", ko: "중고거래 상품", en: "Trade listing" },
  { value: "community_post", ko: "커뮤니티 게시물", en: "Community post" },
  { value: "external_url", ko: "외부 URL", en: "External URL" },
] as const;

async function uploadEventImage(
  kind: "hero" | "section",
  file: File
): Promise<{ url: string; path: string } | { error: string }> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/admin/platform-events/upload-image", {
    method: "POST",
    credentials: "same-origin",
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    path?: string;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.url) {
    return { error: json.error || "upload_failed" };
  }
  return { url: json.url, path: json.path || "" };
}

function emptyDraft(): PlatformEventRow {
  const now = new Date().toISOString();
  return {
    id: "preview",
    title: "",
    subtitle: null,
    heroImageUrl: null,
    heroImagePath: null,
    sections: [],
    terms: null,
    status: "draft",
    startsAt: null,
    endsAt: null,
    timezone: "Asia/Manila",
    ctaLabel: null,
    ctaType: "internal_page",
    ctaTarget: "/market",
    ctaExternalUrl: null,
    publishedAt: null,
    sourceOwnerRequestId: null,
    sourceStoreId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function ctaTypeLabel(ctaType: string | null | undefined, lang: "ko" | "en"): string {
  const hit = CTA_TYPE_OPTIONS.find((o) => o.value === ctaType);
  if (!hit) return ctaType || "—";
  return lang === "en" ? hit.en : hit.ko;
}

export function AdminPlatformEventEditorClient({ eventId }: Props) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const isNew = !eventId || eventId === "new";
  const [draft, setDraft] = useState<PlatformEventRow>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("event");

  const [introBody, setIntroBody] = useState("");
  const [benefitTitle, setBenefitTitle] = useState("");
  const [benefitBody, setBenefitBody] = useState("");
  const [extraImageUrl, setExtraImageUrl] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const heroFileRef = useRef<HTMLInputElement>(null);
  const sectionFileRef = useRef<HTMLInputElement>(null);
  const distributionRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-events/${encodeURIComponent(eventId!)}`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          event?: PlatformEventRow;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.event) {
          setError(json.error || "load_failed");
          return;
        }
        hydrateFromEvent(json.event);
      } catch {
        if (!cancelled) setError("load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };

    function hydrateFromEvent(ev: PlatformEventRow) {
      setDraft(ev);
      const text = ev.sections.find((s) => s.type === "text");
      const benefit = ev.sections.find((s) => s.type === "benefit");
      const image = ev.sections.find((s) => s.type === "image");
      setIntroBody(text && text.type === "text" ? text.body : "");
      setBenefitTitle(benefit && benefit.type === "benefit" ? benefit.title : "");
      setBenefitBody(benefit && benefit.type === "benefit" ? benefit.body || "" : "");
      setExtraImageUrl(image && image.type === "image" ? image.imageUrl : "");
    }
  }, [eventId, isNew]);

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash === "#distribution") {
      distributionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (hash === "#preview") {
      setPreviewTab("event");
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, isNew, draft.id]);

  const buildSections = useCallback((): PlatformEventSection[] => {
    const sections: PlatformEventSection[] = [];
    if (introBody.trim()) sections.push({ type: "text", body: introBody.trim() });
    if (benefitTitle.trim()) {
      sections.push({
        type: "benefit",
        title: benefitTitle.trim(),
        body: benefitBody.trim() || undefined,
      });
    }
    if (extraImageUrl.trim().startsWith("http")) {
      sections.push({ type: "image", imageUrl: extraImageUrl.trim() });
    }
    if (draft.terms?.trim()) {
      /* terms live in terms field; optional terms section omitted to avoid dup */
    }
    return sections;
  }, [introBody, benefitTitle, benefitBody, extraImageUrl, draft.terms]);

  const previewEvent = useMemo(() => {
    return { ...draft, sections: buildSections() };
  }, [draft, buildSections]);

  const operatorStatus = useMemo(
    () =>
      resolveEventOperatorStatus({
        status: draft.status,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
      }),
    [draft.status, draft.startsAt, draft.endsAt]
  );

  const isExternalCta = draft.ctaType === "external_url";
  const showOwnerHandoff = Boolean(draft.sourceOwnerRequestId || draft.sourceStoreId);
  const busy = saving || mediaBusy;

  const validateBeforeSave = useCallback((): boolean => {
    if (!draft.title.trim()) {
      setError(
        safeT("admin_platform_events_error_title_required", {
          fallbackKo: "이벤트 제목을 입력해 주세요.",
          fallbackEn: "Event title is required.",
        })
      );
      return false;
    }
    if (draft.ctaType) {
      const cta = validatePlatformPopupCta({
        ctaType: draft.ctaType,
        ctaTarget: draft.ctaTarget,
        externalUrl: draft.ctaExternalUrl,
      });
      if (!cta.ok) {
        const msgByError: Record<string, { ko: string; en: string }> = {
          destination_id_required: {
            ko:
              draft.ctaType === "store"
                ? "매장을 선택해 주세요."
                : draft.ctaType === "community_post"
                  ? "게시물을 선택해 주세요."
                  : draft.ctaType === "trade_listing"
                    ? "중고거래 상품을 선택해 주세요."
                    : "이동할 대상을 설정해 주세요.",
            en: "Please select a destination target.",
          },
          external_url_required: {
            ko: "외부 URL을 입력해 주세요.",
            en: "External URL is required.",
          },
          internal_path_required: {
            ko: "이동할 페이지를 설정해 주세요.",
            en: "Please set an in-app page path.",
          },
        };
        const mapped = msgByError[cta.error];
        setError(
          mapped
            ? lang === "en"
              ? mapped.en
              : mapped.ko
            : safeT("admin_platform_events_error_destination", {
                fallbackKo: "이동 설정을 확인해 주세요.",
                fallbackEn: "Check destination settings.",
              })
        );
        return false;
      }
    }
    return true;
  }, [
    draft.title,
    draft.ctaType,
    draft.ctaTarget,
    draft.ctaExternalUrl,
    safeT,
    lang,
  ]);

  const save = useCallback(
    async (nextStatus?: PlatformEventStatus) => {
      if (!validateBeforeSave()) return;
      setSaving(true);
      setError(null);
      const sections = buildSections();
      const payload = {
        title: draft.title,
        subtitle: draft.subtitle,
        heroImageUrl: draft.heroImageUrl,
        heroImagePath: draft.heroImagePath,
        sections,
        terms: draft.terms,
        status: nextStatus ?? draft.status,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        timezone: draft.timezone,
        ctaLabel: draft.ctaLabel,
        ctaType: draft.ctaType,
        ctaTarget: draft.ctaTarget,
        ctaExternalUrl: draft.ctaExternalUrl,
      };
      try {
        const res = await fetch(
          isNew
            ? "/api/admin/platform-events"
            : `/api/admin/platform-events/${encodeURIComponent(eventId!)}`,
          {
            method: isNew ? "POST" : "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          event?: PlatformEventRow;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.event) {
          setError(json.error || "save_failed");
          return;
        }
        if (isNew) {
          router.replace(`/admin/platform-events/${encodeURIComponent(json.event.id)}`);
          return;
        }
        setDraft(json.event);
      } catch {
        setError("save_failed");
      } finally {
        setSaving(false);
      }
    },
    [draft, buildSections, isNew, eventId, router, validateBeforeSave]
  );

  const onHeroUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const previousUrl = draft.heroImageUrl;
      const previousPath = draft.heroImagePath;
      setMediaBusy(true);
      setError(null);
      try {
        const out = await uploadEventImage("hero", file);
        if ("error" in out) {
          setDraft((d) => ({ ...d, heroImageUrl: previousUrl, heroImagePath: previousPath }));
          setError(out.error);
          return;
        }
        setDraft((d) => ({
          ...d,
          heroImageUrl: out.url,
          heroImagePath: out.path || null,
        }));
      } finally {
        setMediaBusy(false);
        if (heroFileRef.current) heroFileRef.current.value = "";
      }
    },
    [draft.heroImageUrl, draft.heroImagePath]
  );

  const onSectionUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const previous = extraImageUrl;
      setMediaBusy(true);
      setError(null);
      try {
        const out = await uploadEventImage("section", file);
        if ("error" in out) {
          setExtraImageUrl(previous);
          setError(out.error);
          return;
        }
        setExtraImageUrl(out.url);
      } finally {
        setMediaBusy(false);
        if (sectionFileRef.current) sectionFileRef.current.value = "";
      }
    },
    [extraImageUrl]
  );

  if (loading) {
    return <p className="p-4 text-sm text-sam-muted">…</p>;
  }

  const fieldClass = "mt-1 w-full rounded border border-sam-border px-2 py-1.5";
  const sectionClass =
    "space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4";
  const sectionTitleClass = "text-sm font-semibold text-sam-fg";

  return (
    <div className="space-y-4 p-4" data-admin-platform-event-editor="1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {isNew
            ? safeT("admin_platform_events_create", {
                fallbackKo: "새 이벤트",
                fallbackEn: "New event",
              })
            : safeT("admin_platform_events_edit", {
                fallbackKo: "이벤트 수정",
                fallbackEn: "Edit event",
              })}
        </h1>
        <div className="flex flex-wrap gap-2">
          <AdminActionButton
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {saving
              ? safeT("admin_platform_events_saving", {
                  fallbackKo: "저장 중…",
                  fallbackEn: "Saving…",
                })
              : promotionAdminActionLabel("SAVE", lang)}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={busy}
            onClick={() => void save("published")}
          >
            {promotionAdminActionLabel("PUBLISH", lang)}
          </AdminActionButton>
          <AdminActionButton
            variant="danger"
            disabled={busy || isNew}
            onClick={() => void save("unpublished")}
          >
            {promotionAdminActionLabel("PAUSE_STOP", lang)}
          </AdminActionButton>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showOwnerHandoff ? (
        <div
          className="rounded-ui-rect border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-admin-event-owner-handoff="1"
        >
          {safeT("admin_platform_events_owner_handoff_banner", {
            fallbackKo:
              "오너 요청에서 승인된 Event 초안 — 요청 채널 ≠ 최종 채널",
            fallbackEn:
              "Event draft approved from an owner request — request channels ≠ final channels",
          })}
        </div>
      ) : null}

      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface/95 px-3 py-2 backdrop-blur"
        data-admin-event-op-summary="1"
      >
        <AdminToneBadge tone={promotionOperatorStatusTone(operatorStatus)}>
          {promotionOperatorStatusLabel(operatorStatus, lang)}
        </AdminToneBadge>
        <span className="text-xs text-sam-muted">
          {safeT("admin_promotion_schedule_start", {
            fallbackKo: "노출 시작",
            fallbackEn: "Starts",
          })}
          : {formatPromotionAdminSchedule(draft.startsAt, lang)}
        </span>
        <span className="text-xs text-sam-muted">
          {safeT("admin_promotion_schedule_end", {
            fallbackKo: "노출 종료",
            fallbackEn: "Ends",
          })}
          : {formatPromotionAdminSchedule(draft.endsAt, lang)}
        </span>
        <span className="text-xs text-sam-muted">
          CTA: {draft.ctaLabel?.trim() || "—"} · {ctaTypeLabel(draft.ctaType, lang)}
        </span>
      </div>

      <section className={sectionClass} data-admin-event-section="basic">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_basic", {
            fallbackKo: "기본 정보",
            fallbackEn: "Basic info",
          })}
        </h2>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_title", {
            fallbackKo: "이벤트 제목",
            fallbackEn: "Event title",
          })}
          <input
            className={fieldClass}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_subtitle", {
            fallbackKo: "부제",
            fallbackEn: "Subtitle",
          })}
          <input
            className={fieldClass}
            value={draft.subtitle ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, subtitle: e.target.value.trim() || null }))
            }
          />
        </label>
        <div className="space-y-2">
          <span className="block text-sm">
            {safeT("admin_platform_events_field_hero", {
              fallbackKo: "히어로 이미지",
              fallbackEn: "Hero image",
            })}
          </span>
          <p className="text-xs text-sam-muted">
            {safeT("admin_platform_events_hero_guidance", {
              fallbackKo:
                "권장 비율 16:9 · 권장 1200×675 · jpeg/png/webp · 최대 5MB · cover crop",
              fallbackEn:
                "Recommended 16:9 · 1200×675 · jpeg/png/webp · max 5MB · cover crop",
            })}
          </p>
          <input
            ref={heroFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-xs"
            disabled={busy}
            onChange={(e) => void onHeroUpload(e.target.files?.[0] ?? null)}
          />
          {draft.heroImageUrl ? (
            <div className="space-y-2">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
                <SamarketThumbnail
                  src={draft.heroImageUrl}
                  alt=""
                  fill
                  fetchDisplayPx={640}
                  className="h-full w-full"
                  imageClassName="object-cover"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminActionButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => heroFileRef.current?.click()}
                >
                  {safeT("admin_platform_events_hero_replace", {
                    fallbackKo: "이미지 교체",
                    fallbackEn: "Replace image",
                  })}
                </AdminActionButton>
                <AdminActionButton
                  variant="quiet"
                  disabled={busy}
                  onClick={() =>
                    setDraft((d) => ({ ...d, heroImageUrl: null, heroImagePath: null }))
                  }
                >
                  {safeT("admin_platform_events_hero_remove", {
                    fallbackKo: "히어로 이미지 제거",
                    fallbackEn: "Remove hero image",
                  })}
                </AdminActionButton>
              </div>
            </div>
          ) : null}
          {mediaBusy ? (
            <p className="text-xs text-sam-muted">
              {safeT("admin_platform_events_uploading", {
                fallbackKo: "업로드 중…",
                fallbackEn: "Uploading…",
              })}
            </p>
          ) : null}
        </div>
      </section>

      <section className={sectionClass} data-admin-event-section="content">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_content", {
            fallbackKo: "이벤트 내용",
            fallbackEn: "Event content",
          })}
        </h2>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_intro", {
            fallbackKo: "소개 본문",
            fallbackEn: "Intro body",
          })}
          <textarea
            className={`${fieldClass} h-28`}
            value={introBody}
            onChange={(e) => setIntroBody(e.target.value)}
          />
        </label>
        <div className="space-y-2 rounded-ui-rect border border-dashed border-sam-border p-3">
          <p className="text-xs font-semibold text-sam-muted">
            {safeT("admin_platform_events_benefit_group", {
              fallbackKo: "혜택 정보",
              fallbackEn: "Benefit info",
            })}
          </p>
          <label className="block text-sm">
            {safeT("admin_platform_events_field_benefit_title", {
              fallbackKo: "혜택 제목",
              fallbackEn: "Benefit title",
            })}
            <input
              className={fieldClass}
              value={benefitTitle}
              onChange={(e) => setBenefitTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {safeT("admin_platform_events_field_benefit_body", {
              fallbackKo: "혜택 설명",
              fallbackEn: "Benefit detail",
            })}
            <textarea
              className={`${fieldClass} h-20`}
              value={benefitBody}
              onChange={(e) => setBenefitBody(e.target.value)}
            />
          </label>
        </div>
        <div className="space-y-2">
          <span className="block text-sm">
            {safeT("admin_platform_events_field_section_image", {
              fallbackKo: "추가 이미지",
              fallbackEn: "Section image",
            })}
          </span>
          <input
            ref={sectionFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-xs"
            disabled={busy}
            onChange={(e) => void onSectionUpload(e.target.files?.[0] ?? null)}
          />
          {extraImageUrl ? (
            <div className="space-y-2">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
                <SamarketThumbnail
                  src={extraImageUrl}
                  alt=""
                  fill
                  fetchDisplayPx={640}
                  className="h-full w-full"
                  imageClassName="object-cover"
                />
              </div>
              <AdminActionButton
                variant="quiet"
                disabled={busy}
                onClick={() => setExtraImageUrl("")}
              >
                {safeT("admin_platform_events_section_image_remove", {
                  fallbackKo: "추가 이미지 제거",
                  fallbackEn: "Remove section image",
                })}
              </AdminActionButton>
            </div>
          ) : null}
        </div>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_terms", {
            fallbackKo: "이용 약관 / 유의사항",
            fallbackEn: "Terms",
          })}
          <textarea
            className={`${fieldClass} h-24`}
            value={draft.terms ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, terms: e.target.value.trim() || null }))
            }
          />
        </label>
      </section>

      <section className={sectionClass} data-admin-event-section="destination">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_destination", {
            fallbackKo: "이동 설정",
            fallbackEn: "Destination",
          })}
        </h2>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_cta_label", {
            fallbackKo: "CTA 문구",
            fallbackEn: "CTA label",
          })}
          <input
            className={fieldClass}
            value={draft.ctaLabel ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, ctaLabel: e.target.value.trim() || null }))
            }
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_cta_type", {
            fallbackKo: "이동 유형",
            fallbackEn: "Destination type",
          })}
          <select
            className={fieldClass}
            value={draft.ctaType ?? "internal_page"}
            onChange={(e) => setDraft((d) => ({ ...d, ctaType: e.target.value }))}
          >
            {CTA_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {lang === "en" ? opt.en : opt.ko}
              </option>
            ))}
          </select>
        </label>
        {isExternalCta ? (
          <label className="block text-sm">
            {safeT("admin_platform_events_field_cta_external_url", {
              fallbackKo: "외부 URL",
              fallbackEn: "External URL",
            })}
            <input
              className={fieldClass}
              value={draft.ctaExternalUrl ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  ctaExternalUrl: e.target.value.trim() || null,
                }))
              }
              placeholder="https://"
            />
          </label>
        ) : (
          <label className="block text-sm">
            {safeT("admin_platform_events_field_cta_target", {
              fallbackKo: "이동 대상",
              fallbackEn: "Target",
            })}
            <input
              className={fieldClass}
              value={draft.ctaTarget}
              onChange={(e) => setDraft((d) => ({ ...d, ctaTarget: e.target.value }))}
            />
          </label>
        )}
      </section>

      <section className={sectionClass} data-admin-event-section="schedule">
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_schedule", {
            fallbackKo: "노출 기간",
            fallbackEn: "Schedule",
          })}
        </h2>
        <p className="text-xs text-sam-muted">
          {safeT("admin_platform_events_schedule_tz_note", {
            fallbackKo: "표시 기준 시간대: Asia/Manila",
            fallbackEn: "Display timezone: Asia/Manila",
          })}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            {safeT("admin_promotion_schedule_start", {
              fallbackKo: "노출 시작",
              fallbackEn: "Starts",
            })}
            <input
              type="datetime-local"
              className={fieldClass}
              value={toLocalInput(draft.startsAt)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, startsAt: fromLocalInput(e.target.value) }))
              }
            />
          </label>
          <label className="block text-sm">
            {safeT("admin_promotion_schedule_end", {
              fallbackKo: "노출 종료",
              fallbackEn: "Ends",
            })}
            <input
              type="datetime-local"
              className={fieldClass}
              value={toLocalInput(draft.endsAt)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, endsAt: fromLocalInput(e.target.value) }))
              }
            />
          </label>
        </div>
      </section>

      <section
        ref={distributionRef}
        id="distribution"
        className={sectionClass}
        data-admin-event-section="distribution"
      >
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_distribution", {
            fallbackKo: "노출 설정",
            fallbackEn: "Exposure settings",
          })}
        </h2>
        {!isNew ? (
          <AdminPlatformEventDistributionPanel
            eventId={draft.id}
            eventTitle={draft.title || "Event"}
            benefitTitle={benefitTitle}
            benefitBody={benefitBody}
            heroImageUrl={draft.heroImageUrl}
          />
        ) : (
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_events_distribution_save_first", {
              fallbackKo: "초안을 먼저 저장하면 노출 설정(팝업·배너·푸시·알림함)을 구성할 수 있습니다.",
              fallbackEn:
                "Save the draft first to configure exposure (popup, banner, push, bell).",
            })}
          </p>
        )}
      </section>

      <section
        ref={previewRef}
        id="preview"
        className={sectionClass}
        data-admin-event-section="preview"
      >
        <h2 className={sectionTitleClass}>
          {safeT("admin_platform_events_section_preview", {
            fallbackKo: "미리보기",
            fallbackEn: "Preview",
          })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                id: "event" as const,
                ko: "이벤트 페이지",
                en: "Event page",
              },
              { id: "popup" as const, ko: "팝업", en: "Popup" },
              { id: "banner" as const, ko: "배너", en: "Banner" },
            ] as const
          ).map((tab) => (
            <AdminActionButton
              key={tab.id}
              variant={previewTab === tab.id ? "primary" : "secondary"}
              onClick={() => setPreviewTab(tab.id)}
            >
              {lang === "en" ? tab.en : tab.ko}
            </AdminActionButton>
          ))}
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-[#0f172a]/5">
          {previewTab === "event" ? (
            <div className="max-h-[80vh] overflow-auto bg-sam-app">
              {previewEvent.title ? (
                <PlatformEventDetailContent
                  event={previewEvent}
                  language={language === "en" ? "en" : "ko"}
                />
              ) : (
                <p className="p-4 text-sm text-sam-muted">—</p>
              )}
            </div>
          ) : isNew ? (
            <p className="p-4 text-sm text-sam-muted">
              {safeT("admin_platform_events_preview_dist_after_save", {
                fallbackKo:
                  "초안 저장 후 [노출 설정]에서 팝업·배너 미리보기를 확인하세요.",
                fallbackEn:
                  "After saving the draft, use Exposure settings for popup/banner previews.",
              })}
            </p>
          ) : (
            <p className="p-4 text-sm text-sam-muted">
              {safeT("admin_platform_events_preview_use_dist_panel", {
                fallbackKo:
                  "팝업·배너 미리보기는 위 [노출 설정] 패널에서 확인하세요.",
                fallbackEn:
                  "Popup and banner previews are available in the Exposure settings panel above.",
              })}
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pb-6">
        <AdminActionButton
          variant="primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {saving
            ? safeT("admin_platform_events_saving", {
                fallbackKo: "저장 중…",
                fallbackEn: "Saving…",
              })
            : promotionAdminActionLabel("SAVE", lang)}
        </AdminActionButton>
        <AdminActionButton
          variant="primary"
          disabled={busy}
          onClick={() => void save("published")}
        >
          {promotionAdminActionLabel("PUBLISH", lang)}
        </AdminActionButton>
        <AdminActionButton
          variant="danger"
          disabled={busy || isNew}
          onClick={() => void save("unpublished")}
        >
          {promotionAdminActionLabel("PAUSE_STOP", lang)}
        </AdminActionButton>
      </div>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}
