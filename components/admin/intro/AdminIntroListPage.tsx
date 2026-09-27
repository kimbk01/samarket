"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminSchedule, formatAdminScheduleRange } from "@/components/admin/intro/intro-admin-time";
import {
  introAudienceLabel,
  introDeviceFamilyLabel,
  introFrequencyLabel,
  introPlatformLabel,
} from "@/lib/startup/intro-v2/admin-labels";
import { deviceChipsFromClasses } from "@/lib/startup/intro-v2/admin-targeting-ui";
import { introDerivedStatusLabel, type IntroDerivedStatus, type IntroLiveFlags } from "@/lib/startup/intro-v2/live-status";
import type { IntroAdminListRow } from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroFrequencyMode } from "@/lib/startup/intro-v2/types";

type ListItem = IntroAdminListRow & {
  liveNow?: boolean;
  derived?: IntroDerivedStatus;
  flags?: IntroLiveFlags;
};

function derivedTone(derived?: IntroDerivedStatus, liveNow?: boolean): AdminTone {
  if (liveNow || derived === "LIVE_NOW") return "success";
  if (derived === "SCHEDULED") return "progress";
  if (derived === "PAUSED") return "warning";
  if (derived === "EXPIRED") return "danger";
  if (derived === "ARCHIVED") return "neutral";
  return "waiting";
}

function operationalLabel(item: ListItem, lang: "ko" | "en"): string {
  if (item.liveNow || item.derived === "LIVE_NOW") return introDerivedStatusLabel("LIVE_NOW", lang);
  if (item.derived) return introDerivedStatusLabel(item.derived, lang);
  return lang === "en" ? "Draft" : "초안";
}

function targetSummary(item: ListItem, lang: "ko" | "en"): string {
  const all = lang === "en" ? "All" : "전체";
  const audiences = item.targeting.audiences.length
    ? item.targeting.audiences.map((a) => introAudienceLabel(a, lang)).join(", ")
    : all;
  const platforms = item.targeting.platforms.length
    ? item.targeting.platforms.map((p) => introPlatformLabel(p, lang)).join(", ")
    : all;
  return `${audiences} · ${platforms}`;
}

export function AdminIntroListPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const res = await fetch("/api/admin/intro-campaigns", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: ListItem[];
      error?: string;
    };
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      setItems([]);
    } else if (!res.ok || !json.ok) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load intro campaigns.",
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

  const onCreate = async () => {
    setCreating(true);
    const res = await fetch("/api/admin/intro-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lang === "en" ? "New intro" : "새 인트로",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(lang === "en" ? "Could not create intro." : "인트로를 만들지 못했습니다.");
      return;
    }
    router.push(`/admin/intro/${json.id}`);
  };

  const title = safeT("admin_intro_title", { fallbackKo: "인트로 관리", fallbackEn: "Intro campaigns" });

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={title}
        backHref="/admin/platform-promotion"
        description={
          lang === "en"
            ? "Create and publish first-entry intro campaigns. This is the Admin composer, not Native playback."
            : "첫 진입 인트로를 만들고 게시합니다. 운영자 편집 화면이며 기기 재생이 아닙니다."
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminActionButton variant="primary" onClick={() => void onCreate()} disabled={creating}>
          {safeT("admin_intro_new", { fallbackKo: "새 인트로", fallbackEn: "New intro" })}
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
              fallbackEn: "No intro campaigns yet.",
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
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-[13px]" data-intro-list="composer">
            <thead>
              <tr className="border-b border-sam-border text-sam-muted">
                <th className="px-2 py-2">{lang === "en" ? "Thumbnail" : "썸네일"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Intro name" : "인트로 이름"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Status" : "운영 상태"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Schedule" : "일정"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Target" : "대상 요약"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Scenes" : "장면"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Revision" : "게시 리비전"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Updated" : "수정"}</th>
                <th className="px-2 py-2">{lang === "en" ? "Actions" : "작업"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const devices = deviceChipsFromClasses(item.targeting.deviceClasses);
                const deviceLabel = devices.length
                  ? devices
                      .map((d) => introDeviceFamilyLabel(d === "Phone" ? "PHONE" : "TABLET", lang))
                      .join(", ")
                  : lang === "en"
                    ? "All devices"
                    : "모든 기기";
                const updated = formatAdminSchedule(item.updatedAt, item.timezone);
                return (
                  <tr key={item.id} className="border-b border-sam-border align-top">
                    <td className="px-2 py-2">
                      <div className="h-14 w-11 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                        <SamarketThumbnail src={item.thumbnailUrl} alt="" size={56} className="h-14 w-11" />
                      </div>
                    </td>
                    <td className="px-2 py-2 font-semibold text-sam-fg">
                      {item.name}
                      {item.requiresAdminConfirmation ? (
                        <div className="mt-1 text-[11px] text-amber-800">
                          {lang === "en" ? "Needs confirmation" : "확인 필요"}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <AdminToneBadge tone={derivedTone(item.derived, item.liveNow)}>
                        {operationalLabel(item, lang)}
                      </AdminToneBadge>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.flags?.targetLimited ? (
                          <span className="text-[11px] text-sam-muted">{introDerivedStatusLabel("TARGET_LIMITED", lang)}</span>
                        ) : null}
                        {item.flags?.deviceLimited ? (
                          <span className="text-[11px] text-sam-muted">{introDerivedStatusLabel("DEVICE_LIMITED", lang)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {formatAdminScheduleRange(item.startsAt, item.endsAt, item.timezone, lang)}
                    </td>
                    <td className="px-2 py-2">{targetSummary(item, lang)}</td>
                    <td className="px-2 py-2">{item.sceneCount}</td>
                    <td className="px-2 py-2">
                      {item.publishedRevision != null
                        ? `Revision ${item.publishedRevision}`
                        : lang === "en"
                          ? "Not published"
                          : "게시 전"}
                    </td>
                    <td className="px-2 py-2">
                      {updated || (lang === "en" ? "Not updated" : "수정 기록 없음")}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <AdminActionLink href={`/admin/intro/${item.id}`} variant="secondary">
                          {lang === "en" ? "Edit" : "편집"}
                        </AdminActionLink>
                        <AdminActionButton
                          variant="quiet"
                          onClick={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                        >
                          {openId === item.id
                            ? lang === "en"
                              ? "Hide details"
                              : "자세히 닫기"
                            : lang === "en"
                              ? "Details"
                              : "자세히"}
                        </AdminActionButton>
                      </div>
                      {openId === item.id ? (
                        <div className="mt-2 space-y-1 text-[12px] text-sam-muted">
                          <p>
                            {lang === "en" ? "Media" : "미디어"}:{" "}
                            {item.mediaTypes.length
                              ? item.mediaTypes.join(", ")
                              : lang === "en"
                                ? "None"
                                : "없음"}
                          </p>
                          <p>
                            {lang === "en" ? "Interaction" : "상호작용"}:{" "}
                            {item.hasCta
                              ? lang === "en"
                                ? "Button"
                                : "버튼"
                              : item.interactionModes.length
                                ? item.interactionModes.join(", ")
                                : lang === "en"
                                  ? "None"
                                  : "사용 안 함"}
                          </p>
                          <p>
                            {lang === "en" ? "Devices" : "기기"}: {deviceLabel}
                          </p>
                          <p>
                            {lang === "en" ? "Frequency" : "빈도"}:{" "}
                            {introFrequencyLabel(item.frequencyMode as IntroFrequencyMode, lang)}
                          </p>
                          <p>
                            {lang === "en" ? "Priority" : "우선순위"}: {item.priority}
                          </p>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
