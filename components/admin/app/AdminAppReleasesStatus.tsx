"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type Row = {
  platform: string;
  version_name: string;
  version_code: number | null;
  released_at: string;
  source: string;
  rollout_status: string | null;
};

/** 앱 업데이트 v3 — 자동 기록 상태(읽기 전용). 서버 주기 확인 없이, 기기 보고 때 스토어에서 확인된 버전만 쌓인다. */
export function AdminAppReleasesStatus() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [playKey, setPlayKey] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void fetch("/api/admin/app-releases", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; releases?: Row[]; playKeyConfigured?: boolean } | null) => {
        if (!j?.ok) {
          setFailed(true);
          return;
        }
        setRows(j.releases ?? []);
        setPlayKey(j.playKeyConfigured === true);
      })
      .catch(() => setFailed(true));
  }, []);
  return (
    <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm" data-admin-app-releases>
      <h2 className="font-semibold text-sam-fg">{ko ? "업데이트 내역 자동 수집" : "Update history (auto)"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "스토어에 게시하면, 회원이 앱을 열 때 업데이트 팝업과 함께 그 기기에만 「업데이트 안내」(종 · 소리·푸시 없음)가 생깁니다. 스토어(Google Play·App Store)에서 확인된 버전만 내역에 자동 기록되고, 시험 빌드는 기록되지 않습니다. 입력할 것은 없습니다."
          : "After a store release, outdated devices get the update popup plus a silent bell notice. Only versions confirmed by the store are recorded; test builds are not. Nothing to enter here."}
      </p>
      {playKey === false ? (
        <p className="sam-text-helper text-sam-warning">
          {ko
            ? "Google Play 키가 없어 Android 새 버전은 내역에 기록되지 않습니다."
            : "No Google Play key: new Android versions are not recorded."}
        </p>
      ) : null}
      {failed ? (
        <p className="sam-text-helper text-sam-danger">{ko ? "불러오지 못했습니다" : "Failed to load"}</p>
      ) : rows == null ? null : rows.length === 0 ? (
        <p className="sam-text-helper text-sam-muted">{ko ? "아직 수집된 기록이 없습니다" : "Nothing collected yet"}</p>
      ) : (
        <ul className="divide-y divide-sam-border">
          {rows.map((r) => (
            <li key={`${r.platform}-${r.version_name}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
              <span className="font-medium text-sam-fg">
                {r.platform} {r.version_name}
                {r.version_code != null ? ` (${r.version_code})` : ""}
              </span>
              <span className="sam-text-helper text-sam-muted">{r.source}</span>
              <span className="sam-text-helper text-sam-muted">{formatAdminManilaDateTime(r.released_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
