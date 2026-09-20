"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import type { PlatformEventOwnerRequestRow } from "@/lib/platform-event-owner-requests/types";
import {
  ownerRequestOperatorStatusLabel,
  resolveOwnerRequestOperatorStatus,
} from "@/lib/admin/promotion-operation-status";

export function AdminPlatformEventOwnerRequestQueueClient() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [items, setItems] = useState<PlatformEventOwnerRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-event-owner-requests", {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: PlatformEventOwnerRequestRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setError("load_failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4" data-admin-event-owner-request-queue="1">
      <div>
        <h1 className="text-lg font-semibold">
          {safeT("admin_menu_promotion_owner_requests", {
            fallbackKo: "오너 요청",
            fallbackEn: "Owner requests",
          })}
        </h1>
        <p className="mt-1 text-sm text-sam-muted" data-admin-owner-request-boundary="1">
          {safeT("admin_promotion_owner_request_boundary", {
            fallbackKo:
              "요청 채널 ≠ 최종 채널. 승인 = Event 초안 생성 (게시·배너 활성화·Push 발송 아님).",
            fallbackEn:
              "Requested channels ≠ final channels. Approve = Event draft only (not publish/activate/send).",
          })}
        </p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
        {items.map((item) => {
          const op = resolveOwnerRequestOperatorStatus(item.requestStatus);
          const ch = item.requestedChannels;
          const channels = [
            ch.popup ? "popup" : null,
            ch.banner ? "banner" : null,
            ch.push ? "push" : null,
            ch.bell ? "bell" : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={item.id} className="px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{item.title || "—"}</div>
                  <div className="mt-1 text-xs text-sam-muted">
                    store {item.storeId.slice(0, 8)} · requested: {channels}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <AdminToneBadge tone="waiting">
                    {ownerRequestOperatorStatusLabel(op, lang)}
                  </AdminToneBadge>
                  <AdminActionLink
                    href={`/admin/platform-event-owner-requests/${encodeURIComponent(item.id)}`}
                    variant="secondary"
                  >
                    {safeT("admin_promotion_action_review", {
                      fallbackKo: "검토",
                      fallbackEn: "Review",
                    })}
                  </AdminActionLink>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && !error ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_promotion_owner_request_empty", {
            fallbackKo: "대기 중인 오너 요청이 없습니다.",
            fallbackEn: "No owner requests.",
          })}
        </p>
      ) : null}
      <Link href="/admin/platform-promotion" className="text-xs text-sam-muted underline">
        {safeT("admin_menu_promotion", {
          fallbackKo: "프로모션 / 이벤트",
          fallbackEn: "Promotion / Events",
        })}
      </Link>
    </div>
  );
}
