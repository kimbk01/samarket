"use client";

/**
 * Slice 7 — Admin Trust Projection (score + history + adjust) in one section.
 * Writer: POST /api/admin/trust-score → applyTrustScoreDelta only.
 * History SSOT: GET /api/admin/users/:id/trust → reputation_logs.
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import type { AdminTrustHistoryEntry } from "@/lib/trust/admin-trust-history";
import type { AppLanguageCode } from "@/lib/i18n/config";

type Props = {
  userId: string;
  initialTrustScore?: number | null;
  readOnly?: boolean;
  onUpdated?: () => void;
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function AdminUserTrustSection({
  userId,
  initialTrustScore = null,
  readOnly = false,
  onUpdated,
}: Props) {
  const { t, language, safeT } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const emptyDash = t("admin_users_empty_placeholder");

  const [trustScore, setTrustScore] = useState<number | null>(
    initialTrustScore != null && Number.isFinite(Number(initialTrustScore))
      ? Number(initialTrustScore)
      : null,
  );
  const [history, setHistory] = useState<AdminTrustHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [trustBusy, setTrustBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/trust`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        trustScore?: number;
        history?: AdminTrustHistoryEntry[];
      };
      if (!res.ok || !data.ok) {
        setLoadError(
          data.error ||
            safeT("admin_users_trust_history_load_error", {
              fallbackKo: "신뢰 이력을 불러오지 못했습니다.",
              fallbackEn: "Could not load trust history.",
            }),
        );
        setHistory([]);
        return;
      }
      if (data.trustScore != null && Number.isFinite(Number(data.trustScore))) {
        setTrustScore(Number(data.trustScore));
      }
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      setLoadError(
        safeT("admin_users_trust_history_load_error", {
          fallbackKo: "신뢰 이력을 불러오지 못했습니다.",
          fallbackEn: "Could not load trust history.",
        }),
      );
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [userId, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialTrustScore != null && Number.isFinite(Number(initialTrustScore))) {
      setTrustScore(Number(initialTrustScore));
    }
  }, [initialTrustScore, userId]);

  const handleAdjustTrust = useCallback(async () => {
    const current = trustScore ?? 50;
    const raw = window.prompt(
      safeT("admin_users_trust_adjust_prompt", {
        fallbackKo: `신뢰 점수(0–100). 현재 ${current}`,
        fallbackEn: `Trust score (0–100). Current ${current}`,
      }),
      String(current),
    );
    if (raw == null) return;
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      window.alert(
        safeT("admin_users_trust_adjust_invalid", {
          fallbackKo: "유효한 숫자를 입력해 주세요.",
          fallbackEn: "Enter a valid number.",
        }),
      );
      return;
    }
    const reason =
      window.prompt(
        safeT("admin_users_trust_adjust_reason", {
          fallbackKo: "조정 사유 (선택)",
          fallbackEn: "Reason (optional)",
        }),
      ) ?? "";
    setTrustBusy(true);
    try {
      const res = await fetch("/api/admin/trust-score", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: userId,
          newScore: next,
          reason: reason.trim() || "admin_adjust",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        trustScore?: number;
      };
      if (!res.ok || !data.ok) {
        window.alert(data.message ?? data.error ?? t("admin_users_action_failed"));
        return;
      }
      await load();
      onUpdated?.();
    } catch {
      window.alert(t("admin_users_action_failed"));
    } finally {
      setTrustBusy(false);
    }
  }, [trustScore, userId, safeT, t, load, onUpdated]);

  return (
    <div className={`${ADMIN_USERS_LITE_CARD} flex h-full flex-col`}>
      <div className="border-b border-[#eaecf0] px-5 py-4">
        <h2 className="text-sm font-bold text-[#101828]">
          {safeT("admin_users_trust_section_title", {
            fallbackKo: "신뢰 점수",
            fallbackEn: "Trust score",
          })}
        </h2>
      </div>
      <div className="flex-1 space-y-4 p-5">
        <div className="rounded-lg border border-[#f2f4f7] bg-[#f9fafb] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[#667085]">
                {safeT("admin_users_trust_score_label", {
                  fallbackKo: "신뢰 점수 (trust_score)",
                  fallbackEn: "Trust score (trust_score)",
                })}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#101828]">
                {trustScore == null ? emptyDash : Math.round(trustScore)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[#98a2b3]">
                {safeT("admin_users_trust_score_hint", {
                  fallbackKo: "SSOT: profiles.trust_score · 회원 표시와 동일 권위",
                  fallbackEn: "SSOT: profiles.trust_score · same authority as member UI",
                })}
              </p>
            </div>
            {!readOnly ? (
              <button
                type="button"
                disabled={trustBusy || loading}
                onClick={() => void handleAdjustTrust()}
                className="shrink-0 rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-semibold text-[#2563eb] disabled:opacity-60"
              >
                {safeT("admin_users_trust_adjust", {
                  fallbackKo: "점수 조정",
                  fallbackEn: "Adjust",
                })}
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-[#344054]">
            {safeT("admin_users_trust_history_title", {
              fallbackKo: "신뢰 이력",
              fallbackEn: "Trust history",
            })}
          </p>
          {loading ? (
            <p className="text-sm text-[#667085]">{t("admin_dashboard_loading")}</p>
          ) : loadError ? (
            <p className="text-sm text-[#b42318]">{loadError}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#98a2b3]">
              {safeT("admin_users_trust_history_empty", {
                fallbackKo: "이력이 없습니다.",
                fallbackEn: "No history yet.",
              })}
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-[#eaecf0] bg-white px-3 py-2 text-xs text-[#344054]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums text-[#101828]">
                      {formatDelta(row.delta)}
                    </span>
                    <span className="text-[#667085]">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString(dateLocale)
                        : emptyDash}
                    </span>
                  </div>
                  <p className="mt-1 text-[#667085]">
                    {row.sourceType}
                    {row.status ? ` · ${row.status}` : ""}
                  </p>
                  {row.reason ? (
                    <p className="mt-0.5 truncate text-[#98a2b3]" title={row.reason}>
                      {row.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
