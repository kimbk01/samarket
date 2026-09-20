"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PlatformEventDetailContent } from "@/components/platform-events/PlatformEventDetailContent";
import type {
  PlatformEventRow,
  PlatformEventSection,
  PlatformEventStatus,
} from "@/lib/platform-events/types";

type Props = { eventId: string | null };

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
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function AdminPlatformEventEditorClient({ eventId }: Props) {
  const { safeT, language } = useI18n();
  const router = useRouter();
  const isNew = !eventId || eventId === "new";
  const [draft, setDraft] = useState<PlatformEventRow>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // Section builders (not raw JSON as primary UX)
  const [introBody, setIntroBody] = useState("");
  const [benefitTitle, setBenefitTitle] = useState("");
  const [benefitBody, setBenefitBody] = useState("");
  const [extraImageUrl, setExtraImageUrl] = useState("");

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

  const save = useCallback(
    async (nextStatus?: PlatformEventStatus) => {
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
    [draft, buildSections, isNew, eventId, router]
  );

  if (loading) {
    return <p className="p-4 text-sm text-sam-muted">…</p>;
  }

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-2" data-admin-platform-event-editor="1">
      <div className="space-y-3">
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <label className="block text-sm">
          {safeT("admin_platform_events_field_title", { fallbackKo: "제목", fallbackEn: "Title" })}
          <input
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
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
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            value={draft.subtitle ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, subtitle: e.target.value.trim() || null }))
            }
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_hero", {
            fallbackKo: "히어로 이미지 URL",
            fallbackEn: "Hero image URL",
          })}
          <input
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            value={draft.heroImageUrl ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, heroImageUrl: e.target.value.trim() || null }))
            }
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            starts_at
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
              value={toLocalInput(draft.startsAt)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, startsAt: fromLocalInput(e.target.value) }))
              }
            />
          </label>
          <label className="block text-sm">
            ends_at
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
              value={toLocalInput(draft.endsAt)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, endsAt: fromLocalInput(e.target.value) }))
              }
            />
          </label>
        </div>

        <label className="block text-sm">
          {safeT("admin_platform_events_field_intro", {
            fallbackKo: "소개 본문",
            fallbackEn: "Intro body",
          })}
          <textarea
            className="mt-1 h-28 w-full rounded border border-sam-border px-2 py-1.5"
            value={introBody}
            onChange={(e) => setIntroBody(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_benefit_title", {
            fallbackKo: "혜택 제목",
            fallbackEn: "Benefit title",
          })}
          <input
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
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
            className="mt-1 h-20 w-full rounded border border-sam-border px-2 py-1.5"
            value={benefitBody}
            onChange={(e) => setBenefitBody(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          {safeT("admin_platform_events_field_section_image", {
            fallbackKo: "추가 이미지 URL",
            fallbackEn: "Extra image URL",
          })}
          <input
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            value={extraImageUrl}
            onChange={(e) => setExtraImageUrl(e.target.value)}
          />
        </label>

        <label className="block text-sm">
          CTA label
          <input
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            value={draft.ctaLabel ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, ctaLabel: e.target.value.trim() || null }))
            }
          />
        </label>
        <label className="block text-sm">
          CTA type
          <select
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            value={draft.ctaType ?? "internal_page"}
            onChange={(e) => setDraft((d) => ({ ...d, ctaType: e.target.value }))}
          >
            <option value="internal_page">internal_page</option>
            <option value="store">store</option>
            <option value="trade_listing">trade_listing</option>
            <option value="community_post">community_post</option>
            <option value="external_url">external_url</option>
          </select>
        </label>
        <label className="block text-sm">
          CTA target
          <input
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            value={draft.ctaTarget}
            onChange={(e) => setDraft((d) => ({ ...d, ctaTarget: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Terms
          <textarea
            className="mt-1 h-24 w-full rounded border border-sam-border px-2 py-1.5"
            value={draft.terms ?? ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, terms: e.target.value.trim() || null }))
            }
          />
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold"
            onClick={() => void save("draft")}
          >
            {safeT("admin_platform_events_save_draft", {
              fallbackKo: "초안 저장",
              fallbackEn: "Save draft",
            })}
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-ui-rect bg-sam-fg px-3 py-2 text-sm font-semibold text-sam-app"
            onClick={() => void save("published")}
          >
            {safeT("admin_platform_events_publish", {
              fallbackKo: "게시",
              fallbackEn: "Publish",
            })}
          </button>
          <button
            type="button"
            disabled={saving || isNew}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            onClick={() => void save("unpublished")}
          >
            {safeT("admin_platform_events_unpublish", {
              fallbackKo: "게시 중지",
              fallbackEn: "Unpublish",
            })}
          </button>
        </div>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-[#0f172a]/5">
        <div className="border-b border-sam-border px-3 py-2 text-xs font-semibold text-sam-muted">
          {safeT("admin_platform_events_preview", {
            fallbackKo: "미리보기 (런타임 동일 렌더러)",
            fallbackEn: "Preview (same runtime renderer)",
          })}
        </div>
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
