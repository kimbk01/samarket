"use client";

import {
  cssClassForAmbient,
  cssClassForEnter,
  cssClassForExit,
  logoWidthDp,
} from "@/lib/startup/startup-intro-visual";
import type { StartupConfig } from "@/lib/startup/startup-config";

type Props = {
  config: StartupConfig;
  /** Replay key — increment to restart enter animation. */
  replayKey: number;
  playingExit: boolean;
  frame: "android" | "ios" | "tablet";
};

export function StartupIntroPreview({ config, replayKey, playingExit, frame }: Props) {
  const w = frame === "tablet" ? 280 : frame === "ios" ? 200 : 220;
  const h = frame === "tablet" ? 360 : 400;
  const logoPx = logoWidthDp(config.logo.widthPreset, config.logo.customWidthPx);
  const logoSrc =
    config.logo.source === "uploaded" && config.logo.url
      ? config.logo.url
      : config.logoUrl || "/images/brand/dibay-app-icon-180.png";

  let bg = config.background.color;
  if (config.background.type === "gradient" && config.background.gradientFrom && config.background.gradientTo) {
    const dir =
      config.background.gradientDirection === "horizontal"
        ? "to right"
        : config.background.gradientDirection === "diagonal"
          ? "to bottom right"
          : "to bottom";
    bg = `linear-gradient(${dir}, ${config.background.gradientFrom}, ${config.background.gradientTo})`;
  } else if (config.background.type === "image" && config.background.imageUrl) {
    bg = `center / ${config.background.imageFit === "contain" ? "contain" : "cover"} no-repeat url(${config.background.imageUrl}), ${config.background.color}`;
  }

  const vertical =
    config.logo.verticalPosition === "upper"
      ? "flex-start"
      : config.logo.verticalPosition === "lower"
        ? "flex-end"
        : "center";

  const enterClass = playingExit ? "" : cssClassForEnter(config.introAnimation.enter);
  const exitClass = playingExit ? cssClassForExit(config.introAnimation.exit) : "";
  const ambientClass = cssClassForAmbient(config.introAnimation.ambient);
  const duration = playingExit
    ? config.introAnimation.exitDurationMs
    : config.introAnimation.enterDurationMs;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="sam-text-caption text-sam-muted">
        {frame === "android" ? "Android" : frame === "ios" ? "iPhone" : "Tablet"}
      </p>
      <div
        key={`${frame}-${replayKey}-${playingExit ? "exit" : "enter"}`}
        className={`relative overflow-hidden rounded-[24px] border border-sam-border shadow-sm ${enterClass} ${exitClass}`}
        style={{
          width: w,
          height: h,
          background: bg,
          animationDuration: `${duration}ms`,
        }}
      >
        <div
          className={`flex h-full w-full flex-col items-center px-4 py-10 ${ambientClass}`}
          style={{ justifyContent: vertical, gap: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            width={logoPx}
            height={logoPx}
            style={{ width: logoPx, height: logoPx, objectFit: "contain" }}
          />
          {config.showWordmark ? (
            <p
              className="m-0 text-[15px] font-bold tracking-[0.08em]"
              style={{ color: config.caption.color }}
            >
              {config.wordmark || "DIBAY"}
            </p>
          ) : null}
          {config.caption.enabled && (config.caption.ko || config.caption.en) ? (
            <p className="m-0 max-w-[80%] text-center text-[13px]" style={{ color: config.caption.color }}>
              {config.caption.ko || config.caption.en}
            </p>
          ) : null}
          {config.spinner.enabled ? (
            <div
              aria-hidden
              className="dibay-su-preview-spinner"
              style={{
                width: 22,
                height: 22,
                borderRadius: 9999,
                border: "2px solid rgba(11,66,26,0.22)",
                borderTopColor: "#0B421A",
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
