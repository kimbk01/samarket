"use client";

import { useEffect } from "react";
import { isWebpackChunkLoadError, scheduleChunkReloadOncePerBuild } from "@/lib/next/import-with-chunk-retry";
import { noteEntryFailure } from "@/lib/telemetry/entry-telemetry.client";
import { tryDismissNativeSplash } from "@/lib/startup/startup-metrics";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 최상위 레이아웃(app/layout.tsx) 자체에서 오류가 터졌을 때 표시되는 안전망.
 * 반드시 <html><body>를 포함해야 합니다 (레이아웃을 대체하기 때문).
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[GlobalError]", error);
    noteEntryFailure("global_error");
    // 루트 레이아웃이 깨지면 (main) 셸·AppBootProvider 가 없다 — 여기서 해제하지 않으면 OS 시작 화면에 갇힌다 (C2 · R1-e).
    // 브리지 직접 호출(동적 import 불필요)·멱등. 새로고침이 이어져도 해제가 먼저라 오류 안내가 보인다.
    tryDismissNativeSplash("global_error");
    if (isWebpackChunkLoadError(error)) {
      scheduleChunkReloadOncePerBuild();
    }
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
          background: "#FFFCFC",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "16px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#362415",
              margin: 0,
            }}
          >
            앱을 불러오는 중 문제가 발생했어요
          </p>
          <p
            style={{
              marginTop: "8px",
              fontSize: "13px",
              color: "#604C4C",
            }}
          >
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "32px",
              padding: "10px 24px",
              borderRadius: "8px",
              background: "#0B421A",
              color: "#FFFCFC",
              fontSize: "14px",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
