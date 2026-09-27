"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminScheduleRange } from "@/components/admin/intro/intro-admin-time";
import { introFrequencyLabel } from "@/lib/startup/intro-v2/admin-labels";
import {
  introOperatorAppStateLabel,
  type IntroOperatorAppState,
} from "@/lib/startup/intro-operator-contract";
import type { IntroAdminListRow } from "@/lib/startup/intro-v2/admin-editor-model";

const SECTIONS: IntroOperatorAppState[] = ["applied", "scheduled", "draft", "paused", "ended"];

function appTone(state: IntroOperatorAppState): AdminTone {
  if (state === "applied") return "success";
  if (state === "scheduled") return "progress";
  if (state === "paused") return "warning";
  if (state === "ended") return "neutral";
  return "waiting";
}

function mediaLabel(types: string[], lang: "ko" | "en"): string {
  const first = types[0];
  if (first === "image") return lang === "en" ? "Image" : "이미지";
  if (first === "gif") return "GIF";
  if (first === "video") return lang === "en" ? "Video" : "영상";
  return lang === "en" ? "None" : "없음";
}

export function AdminIntroListPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [items, setItems] = useState<IntroAdminListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const res = await fetch("/api/admin/intro-campaigns", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: IntroAdminListRow[];
    };
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setItems([]);
    } else if (!res.ok || !json.ok) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load intros.",
        })
      );
      setItems([]);
    } else {
      setItems(json.items ?? []);
    }
    setLoading(false);
  }, [safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<IntroOperatorAppState, IntroAdminListRow[]>();
    for (const state of SECTIONS) map.set(state, []);
    for (const item of items) {
      const state = item.appState ?? "draft";
      map.get(state)?.push(item);
    }
    return map;
  }, [items]);

  const onCreate = async () => {
    setCreating(true);
    const res = await fetch("/api/admin/intro-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: lang === "en" ? "New intro" : "새 인트로" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(lang === "en" ? "Could not create intro." : "인트로를 만들지 못했습니다.");
      return;
    }
    router.push(`/admin/intro/${json.id}`);
  };

  const act = async (id: string, action: "pause" | "resume" | "archive" | "duplicate" | "delete") => {
    const url =
      action === "duplicate"
        ? `/api/admin/intro-campaigns/${id}/duplicate`
        : action === "delete"
          ? `/api/admin/intro-campaigns/${id}`
          : `/api/admin/intro-campaigns/${id}/transition`;
    const res = await fetch(url, {
      method: action === "delete" ? "DELETE" : "POST",
      credentials: "same-origin",
      headers: action === "duplicate" || action === "delete" ? undefined : { "Content-Type": "application/json" },
      body: action === "duplicate" || action === "delete" ? undefined : JSON.stringify({ action }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    if (!res.ok || !json.ok) return;
    if (action === "duplicate" && json.id) {
      router.push(`/admin/intro/${json.id}`);
      return;
    }
    await load();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_intro_title", { fallbackKo: "인트로 관리", fallbackEn: "Intro" })}
        backHref="/admin/platform-promotion"
        description={
          lang === "en"
            ? "Register one intro. The app shows that one. Phone and Tablet use the same image."
            : "인트로 하나를 등록하면 앱에 그것이 적용됩니다. Phone과 Tablet은 같은 이미지를 사용합니다."
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminActionButton variant="primary" onClick={() => void onCreate()} disabled={creating}>
          {safeT("admin_intro_new", { fallbackKo: "새 인트로", fallbackEn: "New intro" })}
        </AdminActionButton>
        <AdminActionButton variant="quiet" onClick={() => setShowEnded((v) => !v)}>
          {showEnded
            ? lang === "en"
              ? "Hide ended"
              : "종료 숨기기"
            : lang === "en"
              ? "Show ended / archived"
              : "종료 / 보관 보기"}
        </AdminActionButton>
      </div>
      {loading ? (
        <AdminCard>
          <p className="text-sam-muted">{lang === "en" ? "Loading…" : "불러오는 중…"}</p>
        </AdminCard>
      ) : forbidden ? (
        <AdminCard>
          <p className="text-red-800">
            {safeT("admin_intro_forbidden", {
              fallbackKo: "인트로 관리 권한이 없습니다.",
              fallbackEn: "You do not have access to Intro admin.",
            })}
          </p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <p className="text-red-800">{error}</p>
          <AdminActionButton className="mt-3" variant="secondary" onClick={() => void load()}>
            {lang === "en" ? "Retry" : "다시 시도"}
          </AdminActionButton>
        </AdminCard>
      ) : items.length === 0 ? (
        <AdminCard>
          <p className="text-sam-fg">
            {safeT("admin_intro_empty", {
              fallbackKo: "등록된 인트로가 없습니다.",
              fallbackEn: "No intros yet.",
            })}
          </p>
          <AdminActionButton className="mt-3" variant="primary" onClick={() => void onCreate()}>
            {safeT("admin_intro_empty_cta", {
              fallbackKo: "새 인트로 만들기",
              fallbackEn: "Create intro",
            })}
          </AdminActionButton>
        </AdminCard>
      ) : (
        SECTIONS.filter((state) => state !== "ended" || showEnded).map((state) => {
          const rows = grouped.get(state) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={state} className="space-y-2">
              <h2 className="text-sm font-semibold text-sam-fg">{introOperatorAppStateLabel(state, lang)}</h2>
              <div className="grid gap-3">
                {rows.map((item) => (
                  <AdminCard key={item.id}>
                    <div className="flex flex-wrap gap-4">
                      <div className="h-20 w-16 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                        <SamarketThumbnail src={item.thumbnailUrl} alt="" size={80} className="h-20 w-16" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sam-fg">{item.name}</p>
                          <AdminToneBadge tone={appTone(state)}>
                            {introOperatorAppStateLabel(state, lang)}
                          </AdminToneBadge>
                        </div>
                        <p className="text-sm text-sam-muted">
                          {mediaLabel(item.mediaTypes, lang)} · {formatAdminScheduleRange(item.startsAt, item.endsAt, item.timezone, lang)} ·{" "}
                          {lang === "en" ? "Everyone" : "전체"} · {introFrequencyLabel(item.frequencyMode, lang)}
                        </p>
                        {item.generationId && state === "applied" ? (
                          <p className="text-xs text-sam-muted">
                            {lang === "en" ? "App sync recorded" : "앱 적용 동기화 기록됨"}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <AdminActionLink href={`/admin/intro/${item.id}`} variant="secondary">
                            {safeT("admin_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
                          </AdminActionLink>
                          <AdminActionLink href={`/admin/intro/${item.id}`} variant="secondary">
                            {safeT("admin_intro_edit", { fallbackKo: "수정", fallbackEn: "Edit" })}
                          </AdminActionLink>
                          {state === "applied" || state === "scheduled" ? (
                            <AdminActionButton variant="quiet" onClick={() => void act(item.id, "pause")}>
                              {safeT("admin_intro_pause", { fallbackKo: "중지", fallbackEn: "Pause" })}
                            </AdminActionButton>
                          ) : null}
                          {state === "paused" ? (
                            <AdminActionButton variant="quiet" onClick={() => void act(item.id, "resume")}>
                              {safeT("admin_intro_resume", { fallbackKo: "재개", fallbackEn: "Resume" })}
                            </AdminActionButton>
                          ) : null}
                          <AdminActionButton variant="quiet" onClick={() => void act(item.id, "duplicate")}>
                            {safeT("admin_intro_duplicate", { fallbackKo: "복제", fallbackEn: "Duplicate" })}
                          </AdminActionButton>
                          {state !== "draft" && state !== "ended" ? (
                            <AdminActionButton variant="quiet" onClick={() => void act(item.id, "archive")}>
                              {safeT("admin_intro_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
                            </AdminActionButton>
                          ) : null}
                          {item.status === "draft" ? (
                            <AdminActionButton variant="danger" onClick={() => void act(item.id, "delete")}>
                              {safeT("admin_intro_delete", { fallbackKo: "삭제", fallbackEn: "Delete" })}
                            </AdminActionButton>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </AdminCard>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
