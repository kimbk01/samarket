"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isStagingDeployHost } from "@/lib/platform/staging-deploy-host";

/**
 * 스테이징 표시 — 운영 주소가 아닌 배포 주소로 열었을 때만 화면 테두리(주황)와 상단 이름표를 그린다.
 * 화면 위에 겹쳐 그리기만 하고 터치·클릭은 모두 통과(pointer-events: none) — 레이아웃·크기 영향 0.
 */
export function StagingDeployMarker() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isStagingDeployHost(window.location.hostname));
  }, []);

  if (!show) return null;

  const sha = (process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA ?? "").trim();

  return (
    <div
      aria-hidden
      data-staging-deploy-marker=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        pointerEvents: "none",
        boxShadow: "inset 0 0 0 3px #F97316",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "env(safe-area-inset-top, 0px)",
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "calc(100vw - 16px)",
          padding: "2px 8px",
          borderRadius: "0 0 4px 4px",
          background: "#F97316",
          color: "#FFFFFF",
          fontSize: 11,
          lineHeight: "16px",
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {sha ? t("deploy_staging_marker_label_sha", { sha }) : t("deploy_staging_marker_label")}
      </div>
    </div>
  );
}
