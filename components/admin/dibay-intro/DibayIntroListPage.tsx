"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import type { DibayIntroListItem } from "@/lib/dibay-intro/admin-store";

function formatWhen(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function DibayIntroListPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [items, setItems] = useState<DibayIntroListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/dibay-intros", { credentials: "same-origin", cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: DibayIntroListItem[];
      error?: string;
    };
    if (!res.ok || !json.ok) {
      setError(
        json.error === "schema_missing"
          ? safeT("admin_dibay_intro_schema_missing", {
              fallbackKo: "인트로 저장소를 아직 준비하지 못했습니다.",
              fallbackEn: "Intro storage is not ready yet.",
            })
          : safeT("admin_dibay_intro_load_failed", {
              fallbackKo: "인트로 목록을 불러오지 못했습니다.",
              fallbackEn: "Could not load intros.",
            }),
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

  async function createIntro() {
    setCreating(true);
    const res = await fetch("/api/admin/dibay-intros", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; intro?: { id: string } };
    setCreating(false);
    if (!res.ok || !json.ok || !json.intro?.id) {
      await dibayAlert({
        title: safeT("admin_dibay_intro_create_failed", {
          fallbackKo: "인트로를 만들지 못했습니다.",
          fallbackEn: "Could not create an intro.",
        }),
      });
      return;
    }
    router.push(`/admin/intro/${json.intro.id}`);
  }

  async function publishIntro(id: string) {
    const ok = await dibayConfirm({
      title: safeT("admin_dibay_intro_publish_confirm", {
        fallbackKo: "현재 인트로를 게시하시겠습니까?",
        fallbackEn: "Publish this intro?",
      }),
      confirmLabel: safeT("admin_dibay_intro_confirm", { fallbackKo: "확인", fallbackEn: "OK" }),
      cancelLabel: safeT("admin_dibay_intro_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/dibay-intros/${id}/publish`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) {
      await dibayAlert({
        title: safeT("admin_dibay_intro_publish_fail", {
          fallbackKo: "인트로 게시에 실패했습니다.",
          fallbackEn: "Could not publish the intro.",
        }),
      });
      return;
    }
    await dibayAlert({
      title: safeT("admin_dibay_intro_publish_ok", {
        fallbackKo: "인트로가 게시되었습니다.",
        fallbackEn: "Intro published.",
      }),
    });
    await load();
  }

  async function setLive(id: string) {
    const ok = await dibayConfirm({
      title: safeT("admin_dibay_intro_live_confirm", {
        fallbackKo: "이 인트로를 앱 시작 화면에 노출하시겠습니까?",
        fallbackEn: "Show this intro on the app start screen?",
      }),
      confirmLabel: safeT("admin_dibay_intro_confirm", { fallbackKo: "확인", fallbackEn: "OK" }),
      cancelLabel: safeT("admin_dibay_intro_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/dibay-intros/${id}/set-live`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) {
      await dibayAlert({
        title: safeT("admin_dibay_intro_live_fail", {
          fallbackKo: "앱 노출을 변경하지 못했습니다.",
          fallbackEn: "Could not change the live intro.",
        }),
      });
      return;
    }
    await dibayAlert({
      title: safeT("admin_dibay_intro_live_ok", {
        fallbackKo: "앱 노출 인트로가 변경되었습니다.",
        fallbackEn: "The live intro has been changed.",
      }),
    });
    await load();
  }

  const liveCount = items.filter((item) => item.isLive).length;

  return (
    <div className="mx-auto max-w-5xl p-4" data-dibay-intro-list="1">
      <AdminPageHeader
        titleKey="admin_dibay_intro_title"
        descriptionKey="admin_dibay_intro_list_desc"
      />
      <div className="mb-4 flex justify-end">
        <AdminActionButton variant="primary" disabled={creating} onClick={() => void createIntro()}>
          {creating
            ? safeT("admin_dibay_intro_creating", { fallbackKo: "만드는 중…", fallbackEn: "Creating…" })
            : safeT("admin_dibay_intro_new", { fallbackKo: "새 인트로", fallbackEn: "New intro" })}
        </AdminActionButton>
      </div>
      {error ? <p className="mb-3 text-sm text-sam-danger">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_dibay_intro_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : items.length === 0 ? (
        <AdminCard>
          <p className="text-sm text-sam-muted">
            {safeT("admin_dibay_intro_empty", { fallbackKo: "등록된 인트로가 없습니다.", fallbackEn: "No intros yet." })}
          </p>
        </AdminCard>
      ) : (
        <div className="overflow-hidden rounded-ui-rect border border-sam-border">
          {items.map((item) => {
            const live = item.isLive && liveCount === 1 ? true : item.isLive;
            return (
              <div
                key={item.id}
                data-dibay-intro-row={item.id}
                data-dibay-intro-live={live ? "1" : "0"}
                className={
                  live
                    ? "flex flex-wrap items-center gap-3 border-b border-white/15 bg-[#0B421A] px-4 py-3 text-white last:border-b-0"
                    : "flex flex-wrap items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-3 last:border-b-0"
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {item.title.trim() ||
                      safeT("admin_dibay_intro_untitled", { fallbackKo: "제목 없음", fallbackEn: "Untitled" })}
                  </p>
                  <p className={live ? "text-xs text-white/80" : "text-xs text-sam-muted"}>
                    {safeT("admin_dibay_intro_created", { fallbackKo: "만든 시각", fallbackEn: "Created" })}{" "}
                    {formatWhen(item.createdAt, lang)}
                    {" · "}
                    {safeT("admin_dibay_intro_updated", { fallbackKo: "수정 시각", fallbackEn: "Updated" })}{" "}
                    {formatWhen(item.updatedAt, lang)}
                  </p>
                </div>
                <AdminToneBadge tone={live ? "success" : item.lifecycle === "published" ? "progress" : "neutral"}>
                  {live
                    ? safeT("admin_dibay_intro_live_now", { fallbackKo: "앱 노출 중", fallbackEn: "Live on app" })
                    : item.lifecycle === "published"
                      ? safeT("admin_dibay_intro_published", { fallbackKo: "게시됨", fallbackEn: "Published" })
                      : safeT("admin_dibay_intro_draft", { fallbackKo: "초안", fallbackEn: "Draft" })}
                </AdminToneBadge>
                <div className="flex flex-wrap gap-2">
                  <AdminActionLink href={`/admin/intro/${item.id}`} variant={live ? "secondary" : "secondary"}>
                    {safeT("admin_dibay_intro_edit", { fallbackKo: "편집", fallbackEn: "Edit" })}
                  </AdminActionLink>
                  <AdminActionLink href={`/admin/intro/${item.id}?preview=1`} variant="neutral">
                    {safeT("admin_dibay_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
                  </AdminActionLink>
                  <AdminActionButton variant="neutral" onClick={() => void publishIntro(item.id)}>
                    {safeT("admin_dibay_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
                  </AdminActionButton>
                  {item.lifecycle !== "draft" ? (
                    <AdminActionButton variant="primary" onClick={() => void setLive(item.id)}>
                      {safeT("admin_dibay_intro_set_live", { fallbackKo: "앱 노출", fallbackEn: "Show on app" })}
                    </AdminActionButton>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
