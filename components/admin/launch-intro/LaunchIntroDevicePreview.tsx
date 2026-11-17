"use client";

/**
 * 앱 진입 어드민 v3 §2 — 인트로 미리보기: 기기 3종(20:9 · 16:9 · 태블릿 4:3)을 나란히, 앱 실제 배치(dp)를 줄여 그린다.
 * 배치 값 단일 정의 `lib/launch-intro/pool-admin-view.ts` (네이티브 `DibayNativeIntro.java` 와 같은 값):
 * 상태 줄 · 위 56dp(「광고」 왼쪽 — 켰을 때만 · 건너뛰기 오른쪽) · 아래 88dp(앱 아이콘 + dibaY) · 그 사이 그림 칸(비율 유지 · 잘림 없음).
 * 투명한 곳은 배경색이 보인다. 「▶ N초 재생」 = 표시 시간 동안 보여 준 뒤 사라짐(앱의 걷힘).
 */
import { useEffect, useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  LAUNCH_INTRO_BRAND_ACCENT,
  LAUNCH_INTRO_NATIVE_LAYOUT as L,
  LAUNCH_INTRO_PILL_BG,
  LAUNCH_INTRO_PREVIEW_DEVICES,
  launchIntroPreviewGeometry,
  type LaunchIntroPreviewDeviceId,
} from "@/lib/launch-intro/pool-admin-view";
import { isoToManilaLocal } from "@/lib/launch-intro/schedule";

/** 화면에 그리는 기기 높이(px) — 기기마다 같은 높이로 줄인다 */
const PREVIEW_HEIGHT_PX = 320;
const FADE_MS = 400;
const IMAGE_OUTLINE = "1px dashed rgba(255, 210, 63, 0.95)";
const ROW_OUTLINE = "1px dashed rgba(255, 255, 255, 0.6)";

const DEVICE_LABEL: Record<LaunchIntroPreviewDeviceId, MessageKey> = {
  tall: "admin_launch_intro_v3_preview_tall",
  normal: "admin_launch_intro_v3_preview_normal",
  tablet: "admin_launch_intro_v3_preview_tablet",
};

type Phase = "idle" | "playing" | "fading";

export function LaunchIntroDevicePreview({
  imageUrl,
  imageSize,
  backgroundColor,
  showAdLabel,
  durationMs,
}: {
  imageUrl: string | null;
  imageSize: { width: number; height: number } | null;
  backgroundColor: string;
  showAdLabel: boolean;
  durationMs: number;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState(0);
  const timers = useRef<number[]>([]);
  const clockText = isoToManilaLocal(new Date().toISOString()).slice(11, 16);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const play = () => {
    clearTimers();
    setRunId((n) => n + 1);
    setPhase("playing");
    timers.current.push(
      window.setTimeout(() => setPhase("fading"), durationMs),
      window.setTimeout(() => setPhase("idle"), durationMs + FADE_MS + 600)
    );
  };

  return (
    <div className="space-y-3" data-launch-intro-device-preview="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_launch_intro_v3_preview_title")}</h3>
        {phase === "idle" ? (
          <AdminActionButton variant="secondary" size="sm" disabled={!imageUrl} onClick={play} data-launch-intro-preview-play="">
            {t("admin_launch_intro_v3_preview_play", { seconds: durationMs / 1000 })}
          </AdminActionButton>
        ) : (
          <AdminActionButton
            variant="secondary"
            size="sm"
            onClick={() => {
              clearTimers();
              setPhase("idle");
            }}
          >
            {t("admin_launch_intro_preview_stop")}
          </AdminActionButton>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {LAUNCH_INTRO_PREVIEW_DEVICES.map((d) => {
          const s = PREVIEW_HEIGHT_PX / d.heightDp;
          const g = launchIntroPreviewGeometry(d, imageUrl ? imageSize : null);
          const px = (dp: number) => dp * s;
          return (
            <figure key={d.id} className="m-0 text-center" data-launch-intro-preview-device={d.id}>
              <div
                className="relative overflow-hidden rounded-ui-rect border-4 border-sam-fg bg-sam-app"
                style={{ width: px(d.widthDp) + 8, height: PREVIEW_HEIGHT_PX + 8 }}
              >
                <div
                  key={`${d.id}-${runId}`}
                  className="absolute inset-0"
                  style={{
                    background: backgroundColor,
                    opacity: phase === "fading" ? 0 : 1,
                    transition: phase === "fading" ? `opacity ${FADE_MS}ms ease-out` : undefined,
                  }}
                >
                  {/* 상태 줄 */}
                  <div
                    className="absolute left-0 right-0 top-0 flex items-center bg-black/10 font-semibold text-white"
                    style={{ height: px(L.statusBarDp), paddingLeft: px(12), fontSize: Math.max(6, px(12)) }}
                  >
                    {clockText}
                  </div>
                  {/* 위 56dp 줄 */}
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: g.topRow.y * s, height: g.topRow.height * s, outline: ROW_OUTLINE, outlineOffset: -1 }}
                  >
                    {showAdLabel ? (
                      <span
                        className="absolute rounded-full font-bold leading-none text-white"
                        style={{
                          top: px(L.adPillTopDp),
                          left: px(L.adPillSideDp),
                          padding: `${px(5)}px ${px(10)}px`,
                          fontSize: Math.max(5, px(L.pillTextSp)),
                          background: LAUNCH_INTRO_PILL_BG,
                        }}
                        data-launch-intro-preview-ad=""
                      >
                        {t("admin_launch_intro_v3_preview_ad")}
                      </span>
                    ) : null}
                    <span
                      className="absolute flex items-center rounded-full font-bold leading-none text-white"
                      style={{
                        top: px(L.skipPillTopDp),
                        right: px(L.skipPillSideDp),
                        minHeight: px(36),
                        padding: `0 ${px(10)}px`,
                        fontSize: Math.max(5, px(L.pillTextSp)),
                        background: LAUNCH_INTRO_PILL_BG,
                      }}
                    >
                      {t("admin_launch_intro_v3_preview_skip")}
                    </span>
                  </div>
                  {/* 그림 칸 — 비율 유지 맞춤(잘림 없음) */}
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: g.imageBox.y * s, height: g.imageBox.height * s, outline: IMAGE_OUTLINE, outlineOffset: -1 }}
                  />
                  {imageUrl && g.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기(원본 그림 그대로)
                    <img
                      src={imageUrl}
                      alt=""
                      className="absolute"
                      style={{ left: g.image.x * s, top: g.image.y * s, width: g.image.width * s, height: g.image.height * s }}
                    />
                  ) : (
                    <div
                      className="absolute flex items-center justify-center px-2 text-center text-white/80"
                      style={{ left: 0, right: 0, top: g.imageBox.y * s, height: g.imageBox.height * s, fontSize: 12 }}
                    >
                      {t("admin_launch_intro_v3_preview_empty")}
                    </div>
                  )}
                  {/* 아래 88dp 브랜드 줄 */}
                  <div
                    className="absolute left-0 right-0 flex items-center justify-center font-bold text-white"
                    style={{ top: g.bottomRow.y * s, height: g.bottomRow.height * s, outline: ROW_OUTLINE, outlineOffset: -1 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 앱 아이콘 */}
                    <img src="/icon.png" alt="" style={{ width: px(L.brandIconDp), height: px(L.brandIconDp) }} />
                    <span style={{ marginLeft: px(8), fontSize: px(L.brandTextSp), lineHeight: 1 }}>
                      diba<span style={{ color: LAUNCH_INTRO_BRAND_ACCENT }}>Y</span>
                    </span>
                  </div>
                  {phase === "playing" ? (
                    <div
                      key={`bar-${runId}`}
                      className="absolute left-0 h-[2px] bg-white/80"
                      style={{ top: (g.topRow.y + g.topRow.height) * s - 2, animation: `liaPoolBar ${durationMs}ms linear forwards` }}
                    />
                  ) : null}
                </div>
              </div>
              <figcaption className="mt-1 sam-text-helper text-sam-muted">
                {t(DEVICE_LABEL[d.id])}
                <span className="block tabular-nums">
                  {d.widthDp}×{d.heightDp}dp
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <style>{`@keyframes liaPoolBar { from { width: 0 } to { width: 100% } }`}</style>
      <div className="flex flex-wrap gap-4 sam-text-helper text-sam-muted" data-launch-intro-preview-legend="">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-4" style={{ outline: IMAGE_OUTLINE, background: "rgba(0,0,0,0.6)" }} />
          {t("admin_launch_intro_v3_legend_image")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-4" style={{ outline: ROW_OUTLINE, background: "rgba(0,0,0,0.6)" }} />
          {t("admin_launch_intro_v3_legend_rows")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-4 rounded-ui-rect border border-sam-border" style={{ background: backgroundColor }} />
          {t("admin_launch_intro_v3_legend_bg")}
        </span>
      </div>
      <p className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-helper text-sam-fg">
        {t("admin_launch_intro_v3_preview_note")}
      </p>
    </div>
  );
}
