"use client";

import { useEffect, useState } from "react";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";

type StoreOpt = { id: string; slug: string; name: string };

/**
 * DS-2 (2026-11-04): 피드 배너 매장 목적지 = 매장 선택기 (자유 id 입력 대신).
 * 고른 매장의 **slug** 를 값으로 돌려준다 — 매장 화면은 `/stores/:slug` 로만 열린다. 공개(승인·보임) 매장만 나온다.
 */
export function FeedAdStoreDestinationPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<StoreOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<StoreOpt | null>(null);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      fetch(`/api/admin/feed-ads/stores?q=${encodeURIComponent(q.trim())}`, { credentials: "include", cache: "no-store" })
        .then(async (res) => {
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; stores?: StoreOpt[] };
          if (cancelled) return;
          if (!res.ok || !j.ok || !Array.isArray(j.stores)) {
            setFailed(true);
            setOptions([]);
            return;
          }
          setOptions(j.stores);
          const hit = j.stores.find((s) => s.slug === value);
          if (hit) setPicked(hit);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [q, disabled, value]);

  return (
    <div className="space-y-2" data-feed-ad-store-picker="">
      <p className="sam-text-helper text-sam-muted" data-feed-ad-store-picked="">
        {value
          ? `선택한 매장: ${picked?.name || value} (/stores/${value})`
          : "아직 매장을 고르지 않았습니다."}
      </p>
      {disabled ? null : (
        <>
          <input
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
            placeholder="매장 이름으로 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {failed ? <p className="sam-text-helper text-sam-danger">매장 목록을 불러오지 못했습니다.</p> : null}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {options.map((s) => (
              <li key={s.id}>
                <AdminListItemButton
                  selected={s.slug === value}
                  data-selected={s.slug === value ? "true" : undefined}
                  onClick={() => {
                    setPicked(s);
                    onChange(s.slug);
                  }}
                  className="flex items-center justify-between gap-2 border border-sam-border sam-text-body text-sam-fg"
                >
                  <span className="truncate">{s.name || s.slug}</span>
                  <span className="shrink-0 sam-text-helper text-sam-muted">{s.slug}</span>
                </AdminListItemButton>
              </li>
            ))}
            {!loading && !failed && options.length === 0 ? (
              <li className="sam-text-helper text-sam-muted">찾는 공개 매장이 없습니다.</li>
            ) : null}
          </ul>
        </>
      )}
    </div>
  );
}
