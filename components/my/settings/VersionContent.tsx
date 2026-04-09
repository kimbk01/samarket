"use client";

import { useEffect, useState } from "react";

export function VersionContent() {
  const [version, setVersion] = useState("1.0.0");
  const [build, setBuild] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/settings/version", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          version?: string;
          build?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(typeof json.error === "string" ? json.error : "버전 정보를 불러오지 못했습니다.");
          return;
        }
        setVersion(typeof json.version === "string" && json.version.trim() ? json.version : "1.0.0");
        setBuild(typeof json.build === "string" && json.build.trim() ? json.build : null);
      } catch {
        if (!cancelled) setError("버전 정보를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p className="text-[15px] text-gray-900">
        현재 버전 {loading ? "확인 중" : version}
        {!loading && build != null ? ` (${build})` : ""}
      </p>
      <p className={`mt-2 text-[13px] ${error ? "text-red-600" : "text-gray-500"}`}>
        {error || "최신 버전 정보를 기준으로 표시합니다."}
      </p>
    </div>
  );
}
