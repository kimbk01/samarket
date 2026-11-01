"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { useAppReleaseHistory, type AppReleaseItem } from "@/components/app-updates/use-app-release-history";
import { getAndroidPlayUpdateInfo, startAndroidFlexibleUpdate } from "@/lib/platform/android-play-in-app-update";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { Sam } from "@/lib/ui/sam-component-classes";

const VERSION_HREF = "/mypage/section/settings/version";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.dibay.app";

/** 바뀐 점 3줄 + 「더 보기」 */
function ReleaseNotes({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const shown = open ? lines : lines.slice(0, 3);
  return (
    <div className="mt-1.5 text-[13px] leading-relaxed text-sam-fg">
      {shown.map((l, i) => (
        <p key={i} className="break-words">
          {l}
        </p>
      ))}
      {!open && lines.length > 3 ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-0.5 text-[12px] font-semibold text-sam-primary">
          {t("app_updates_more")}
        </button>
      ) : null}
    </div>
  );
}

/**
 * 업데이트 내역 (앱 업데이트 v2 · Owner 승인 2026-11-01) — 스토어 출시 기록이 자동으로 쌓인다(어드민 입력 없음).
 * 새 버전 줄 = 강조 + 「새 버전」(줄 안 버튼 없음) · 설치 버전 아래 「지금 업데이트」 1개(최신이면 비활성 「최신 버전」).
 */
export function AppUpdateHistoryClient() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const focusVersion = searchParams.get("v");
  const h = useAppReleaseHistory();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (h.status !== "ready" || !focusVersion) return;
    const el = document.querySelector<HTMLElement>(`[data-release-version="${CSS.escape(focusVersion)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [h.status, focusVersion]);

  const newest = useMemo(() => h.releases.find((r) => r.isNew) ?? null, [h.releases]);
  const notesOf = (r: AppReleaseItem) => (language === "en" ? r.notesEn || r.notesKo : r.notesKo || r.notesEn);

  const onUpdate = async () => {
    if (!h.hasUpdate || busy) return;
    setBusy(true);
    try {
      if (h.platform === "android") {
        const info = await getAndroidPlayUpdateInfo();
        if (info.ok && info.info.updateAvailability === "UPDATE_AVAILABLE") {
          await startAndroidFlexibleUpdate();
          return;
        }
        window.open(PLAY_STORE_URL, "_system");
        return;
      }
      if (h.latestStoreUrl) window.open(h.latestStoreUrl, "_system");
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (h.status === "loading") body = <MyStateView kind="loading" template="list" rows={4} />;
  else if (h.status === "web")
    body = <MyStateView kind="empty" template="list" empty={{ title: t("app_updates_web_only") }} />;
  else if (h.status === "error")
    body = <MyStateView kind="error" template="list" error={{ message: t("app_updates_load_failed"), onRetry: h.reload }} />;
  else if (h.releases.length === 0)
    body = <MyStateView kind="empty" template="list" empty={{ title: t("app_updates_empty") }} />;
  else
    body = (
      <ul className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface" data-testid="app-updates-list">
        {h.releases.map((r, i) => (
          <li
            key={r.version}
            data-release-version={r.version}
            data-release-new={r.isNew ? "1" : "0"}
            className={`px-4 py-3.5 ${i === 0 ? "" : "border-t border-sam-border-soft"} ${
              r.isNew ? "bg-sam-primary-soft/40 ring-2 ring-inset ring-sam-primary" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[15px] font-bold ${r.isNew || r.isCurrent ? "text-sam-fg" : "text-sam-muted"}`}>
                {/* 실기 2026-11-01: 같은 이름(1.2.5)의 다른 빌드가 같은 버전처럼 보였다 → Android 는 빌드 번호를 함께 */}
                {h.platform === "android" && r.versionCode != null ? `${r.version} (${r.versionCode})` : r.version}
              </span>
              {r.isNew ? (
                <span className="rounded-ui-rect bg-sam-primary px-1.5 text-[11px] font-bold leading-[18px] text-sam-on-primary">
                  {t("app_updates_new")}
                </span>
              ) : r.isCurrent ? (
                <span className="rounded-ui-rect bg-sam-primary-soft px-1.5 text-[11px] font-bold leading-[18px] text-sam-primary">
                  {t("app_updates_current")}
                </span>
              ) : null}
              <span className="ml-auto text-[12px] tabular-nums text-sam-muted">{formatMypageDate(r.releasedAt)}</span>
            </div>
            {notesOf(r) ? <ReleaseNotes text={notesOf(r)!} /> : null}
          </li>
        ))}
      </ul>
    );

  const showButton = h.status === "ready" && (h.platform === "android" || h.platform === "ios");

  return (
    <MyScreen title={t("app_updates_title")} backHref={VERSION_HREF} preferHistoryBack template="list">
      <div className="flex flex-col gap-3 pb-6">
        {h.installedLabel ? (
          <p className="px-0.5 text-[13px] text-sam-muted" data-testid="app-updates-installed">
            {t("app_updates_installed", { version: h.installedLabel })}
          </p>
        ) : null}
        {/* 버튼 1개 — 실기 2026-11-01: 아래 고정이면 하단 탭에 가려져 설치 버전 바로 아래에 둔다 */}
        {showButton ? (
          <button
            type="button"
            disabled={!h.hasUpdate || busy}
            onClick={() => void onUpdate()}
            className={`${Sam.btn.primaryCombo} ${Sam.focusRing} flex min-h-12 w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60`}
            data-testid="app-updates-cta"
            data-cta-enabled={h.hasUpdate ? "1" : "0"}
          >
            {h.hasUpdate && newest
              ? t("app_updates_update_to", {
                  version:
                    h.platform === "android" && newest.versionCode != null
                      ? `${newest.version} (${newest.versionCode})`
                      : newest.version,
                })
              : t("app_updates_latest")}
          </button>
        ) : null}
        {body}
      </div>
    </MyScreen>
  );
}
