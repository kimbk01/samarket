"use client";

import { useEffect, useState } from "react";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

/**
 * Owner 결정 O-5 (2026-11-03): 「전체 광고」 위 바로가기 카드 — 공통 목록에 없는 광고 4종(인트로·당겨서 새로고침·
 * 마이페이지 배너·이벤트)을 이 화면에서도 보고 들어가게 한다. 읽기 전용 요약 + 「관리」(각 화면이 정본 · 새 원장 없음 · M2 카드 형태).
 */
type Summary = {
  /** schedule = Live 게시본 기간 판정(`launchIntroScheduleState`) · null = 게시본 없음·읽기 실패 */
  intro: { state: string; live: boolean; schedule?: "always" | "scheduled" | "running" | "ended" | null };
  ptrLive: number | null;
  mypageBannersLive: number | null;
  eventsLive: number | null;
};

const INTRO_STATE_KEY: Record<string, MessageKey> = {
  active: "admin_ads_intro_state_live",
  paused: "admin_ads_intro_state_paused",
  unpublished: "admin_ads_intro_state_unpublished",
};

/**
 * IN-N2 (2026-11-04): 인트로 카드 = 상태 + 기간. 게시(active)여도 시작 전이면 「예약됨」, 종료 후면 「끝남」 — 고객 기기에는 안 나온다.
 * 기간을 못 읽었으면 「게시 중」으로 단정하지 않고 「기간 확인 못 함」을 붙인다.
 */
export function introCardStatusText(intro: Summary["intro"], ko: boolean): string {
  const stateKey = INTRO_STATE_KEY[intro.state];
  if (!stateKey) return translateBy(ko ? "ko" : "en", "admin_ads_unknown");
  const base = translateBy(ko ? "ko" : "en", stateKey);
  if (intro.state !== "active") return base;
  switch (intro.schedule) {
    case "scheduled":
      return translateBy(ko ? "ko" : "en", "admin_ads_scheduled_not_shown_before_start");
    case "ended":
      return translateBy(ko ? "ko" : "en", "admin_ads_ended_not_shown_after_end");
    case "always":
    case "running":
      return base;
    default:
      return translateBy(ko ? "ko" : "en", "admin_ads_live_period_unknown");
  }
}

export function AdminAdsOtherSurfacesCards({ ko }: { ko: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/advertising/other-surfaces", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok?: boolean } & Partial<Summary>) => {
        if (!alive) return;
        if (j.ok && j.intro) setSummary(j as Summary);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const liveText = (n: number | null | undefined) =>
    summary == null ? (failed ? (translateBy(ko ? "ko" : "en", "admin_ads_unavailable")) : "…") : n == null ? (translateBy(ko ? "ko" : "en", "admin_ads_unknown")) : translateBy(ko ? "ko" : "en", "admin_ads_n_live", { n });
  const cards = [
    {
      key: "intro",
      title: translateBy(ko ? "ko" : "en", "admin_ads_launch_intro"),
      statusText:
        summary == null ? liveText(null) : introCardStatusText(summary.intro, ko),
      href: "/admin/platform-promotion/intro",
    },
    { key: "ptr", title: translateBy(ko ? "ko" : "en", "admin_ads_pull_refresh_ads"), statusText: liveText(summary?.ptrLive), href: "/admin/ptr-reveal-ads" },
    { key: "mypage", title: translateBy(ko ? "ko" : "en", "admin_ads_my_page_banner"), statusText: liveText(summary?.mypageBannersLive), href: "/admin/my/banners" },
    { key: "events", title: translateBy(ko ? "ko" : "en", "admin_ads_events"), statusText: liveText(summary?.eventsLive), href: "/admin/platform-events" },
  ];

  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-admin-ads-other-surfaces="">
      {cards.map((c) => (
        <div
          key={c.key}
          className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5"
          data-admin-ads-other-surface={c.key}
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-sam-fg">{c.title}</p>
            <p className="text-[12px] text-sam-muted">{c.statusText}</p>
          </div>
          <AdminActionLink href={c.href} variant="secondary" size="sm">
            {translateBy(ko ? "ko" : "en", "admin_ads_manage")}
          </AdminActionLink>
        </div>
      ))}
    </section>
  );
}
