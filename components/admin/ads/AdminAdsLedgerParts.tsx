"use client";

/**
 * 광고 원장 행·상세 부품 (설계 ads-admin-ssot-design-2026-11-07 §1-3 · §2 · §3-2 · §3-3 · 2026-11-07).
 * - `AdminAdsLedgerShortcuts`: 상세 · 광고주 문의 · 충전·잔액 · 광고주 상세 — 권한이 없으면 꺼짐 + 이유
 * - `AdminAdsLedgerRowCells`: 행 칸(종류·위치·광고주·상태·결제·성과) — 공통 원장 = 도메인 메뉴 같은 칸
 * - `AdminAdsLedgerDrawerPanel`: 상세 패널 — 원장 칸 + 바로 가기 + 바로 수정(우선순위·기간·목적지 · 이미지는 수정 화면) + 삭제(R2 공용 버튼)
 */
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { actorMeetsAdminRouteRequirement, type AdminRouteRequirement } from "@/lib/admin/access/admin-route-access";
import { adminAdKindWriteRequirement, isAdminAdDeleteKind } from "@/lib/admin/access/admin-ads-authority";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminIsoToManilaInput, adminManilaInputToIso } from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import type { AdsActionItem, AdsLedgerFields } from "@/lib/admin/ads-control-plane/types";
import {
  adsLedgerAdvertiserLabel,
  adsLedgerKindLabel,
  adsLedgerPaymentLabel,
  adsLedgerPerformanceLabel,
  adsLedgerStatusLabel,
  buildAdsLedgerShortcuts,
  type AdsLedgerShortcut,
} from "@/lib/admin/ads-ledger/ad-ledger-presentation";
import { adLocationLabel } from "@/lib/admin/ads-ledger/ad-location-label";
import { parseWorkspaceEntityId } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

function requirementKeyLabel(req: AdminRouteRequirement): string {
  return req.kind === "permission" ? req.key : req.kind;
}

/** 원장 칸이 있는 행만 — 원장 상태 탭(삭제됨 포함)은 원장 칸이 가진 DB 상태를 쓴다 */
export function ledgerStatusTabOf(item: AdsActionItem, fallbackTab: string): string {
  return item.ledger?.statusTab || fallbackTab;
}

export function AdminAdsLedgerShortcuts({
  item,
  compact = false,
}: {
  item: AdsActionItem;
  compact?: boolean;
}) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const { actor } = useAdminAccessActor();
  if (!item.ledger) return null;
  const shortcuts = buildAdsLedgerShortcuts(
    { sourceId: parseWorkspaceEntityId(item.id), detailHref: item.href, ledger: item.ledger },
    ko
  ).filter((s) => !(compact && s.id === "detail"));
  if (shortcuts.length === 0) return null;
  const allowed = (s: AdsLedgerShortcut) =>
    !s.requirement || (actor ? actorMeetsAdminRouteRequirement(s.requirement, actor) : false);
  return (
    <div className="flex flex-wrap gap-1" data-admin-ads-ledger-shortcuts={item.id}>
      {shortcuts.map((s) =>
        allowed(s) ? (
          <AdminActionLink
            key={s.id}
            href={s.href}
            variant="quiet"
            size="sm"
            data-admin-ads-ledger-shortcut={s.id}
          >
            {s.label}
          </AdminActionLink>
        ) : (
          <span key={s.id} className="inline-flex flex-col" data-admin-ads-ledger-shortcut-disabled={s.id}>
            <AdminActionButton variant="quiet" size="sm" disabled aria-disabled="true">
              {s.label}
            </AdminActionButton>
            <span className="text-[12px] text-sam-muted">
              {t("ads_ledger_sc_need_perm", { key: s.requirement ? requirementKeyLabel(s.requirement) : "" })}
            </span>
          </span>
        )
      )}
    </div>
  );
}

/** 행 칸 문구 (공통 원장 = 도메인 메뉴 같은 칸) */
export function adsLedgerRowTexts(ledger: AdsLedgerFields, ko: boolean) {
  return {
    kindLabel: adsLedgerKindLabel(ledger.kind, ko),
    location: adLocationLabel(ledger, ko),
    advertiser: adsLedgerAdvertiserLabel(ledger, ko),
    statusLabel: adsLedgerStatusLabel(ledger.statusTab, ledger, ko),
    payment: adsLedgerPaymentLabel(ledger, ko),
    performance: adsLedgerPerformanceLabel(ledger, ko),
  };
}

export function AdminAdsLedgerRowCells({ item }: { item: AdsActionItem }) {
  const { language } = useI18n();
  const ko = language !== "en";
  if (!item.ledger) return null;
  const x = adsLedgerRowTexts(item.ledger, ko);
  return (
    <div className="space-y-0.5 text-[12px]" data-admin-ads-ledger-cells={item.ledger.kind}>
      <div className="text-sam-fg" data-admin-ads-ledger-location="1">{x.location}</div>
      <div className="text-sam-muted" data-admin-ads-ledger-advertiser="1">{x.advertiser}</div>
      <div className="text-sam-muted" data-admin-ads-ledger-payment="1">{x.payment}</div>
      <div className="text-sam-muted tabular-nums" data-admin-ads-ledger-performance="1">{x.performance}</div>
    </div>
  );
}

type QuickEditTarget =
  | { api: "popup"; id: string }
  | { api: "feed"; id: string }
  | null;

/** §3-3 바로 수정 대상 — 기존 저장 API 를 부른다 (팝업·PTR = platform-popup-campaigns PATCH · 운영자 피드 = feed-ads PATCH) */
export function adsLedgerQuickEditTarget(item: AdsActionItem): QuickEditTarget {
  const l = item.ledger;
  if (!l) return null;
  const id = parseWorkspaceEntityId(item.id);
  if (l.kind === "popup_admin" || l.kind === "ptr") return { api: "popup", id };
  if (l.kind === "feed_admin" || l.kind === "feed_event") return { api: "feed", id: l.linkedCampaignId ?? id };
  return null;
}

export function AdminAdsLedgerDrawerPanel({
  item,
  onChanged,
}: {
  item: AdsActionItem;
  onChanged: () => void;
}) {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const { actor } = useAdminAccessActor();
  const l = item.ledger;
  const target = adsLedgerQuickEditTarget(item);
  const [priority, setPriority] = useState<string>(item.priority != null ? String(item.priority) : "");
  const [start, setStart] = useState(adminIsoToManilaInput(l?.startAt ?? null));
  const [end, setEnd] = useState(adminIsoToManilaInput(l?.endAt ?? null));
  const [dest, setDest] = useState(item.destinationLabel ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!l) return null;
  const x = adsLedgerRowTexts(l, ko);
  const deleteKind = l.deleteKind && isAdminAdDeleteKind(l.deleteKind) ? l.deleteKind : null;
  const editReq = deleteKind ? adminAdKindWriteRequirement(deleteKind, { ownerPopup: l.kind === "popup_owner" }) : null;
  const canEdit = editReq && actor ? actorMeetsAdminRouteRequirement(editReq, actor) : false;
  const isBoost = l.kind === "trade_promotion" || l.kind === "community_promotion";
  const isLive = l.statusTab === "live" || l.statusTab === "scheduled" || l.statusTab === "waiting";

  const save = async () => {
    if (!target) return;
    const body: Record<string, unknown> = {};
    const touched: string[] = [];
    const p = priority.trim() === "" ? null : Number(priority);
    if (p != null && Number.isFinite(p) && p !== item.priority) body.priority = Math.trunc(p);
    const sIso = start ? adminManilaInputToIso(start) : null;
    const eIso = end ? adminManilaInputToIso(end) : null;
    if (target.api === "feed" && (sIso !== (l.startAt ? new Date(l.startAt).toISOString() : null) || eIso !== (l.endAt ? new Date(l.endAt).toISOString() : null))) {
      body.startAt = sIso;
      body.endAt = eIso;
    }
    const d = dest.trim();
    if (d && d !== (item.destinationLabel ?? "") && /^https:\/\//i.test(d)) {
      if (target.api === "feed") {
        body.destinationType = "external_url";
        body.destinationUrl = d;
      } else {
        body.ctaType = "external_url";
        body.externalUrl = d;
        touched.push("cta");
      }
    }
    if (Object.keys(body).length === 0) return;
    // §3-1: 수정 = L1 저장 확인 · 재검토로 가는 변경(노출 중 소재·목적지)이면 경고
    const confirmed = await confirmAdminAction({
      action: "save",
      ko,
      title: t("ads_ledger_edit_title"),
      description: touched.length > 0 && isLive ? t("ads_ledger_edit_review_warn") : x.kindLabel,
      confirmLabel: t("ads_ledger_edit_save"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setMsg("");
    try {
      const url =
        target.api === "popup"
          ? `/api/admin/platform-popup-campaigns/${encodeURIComponent(target.id)}`
          : `/api/admin/feed-ads/${encodeURIComponent(target.id)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target.api === "popup" && touched.length ? { ...body, materialTouched: touched } : body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; revertedToReview?: boolean };
      if (!res.ok || !j.ok) {
        setMsg(typeof j.message === "string" && j.message ? j.message : t("ads_ledger_edit_failed"));
        return;
      }
      setMsg(j.revertedToReview ? `${t("ads_ledger_edit_saved")} ${t("ads_ledger_edit_review_warn")}` : t("ads_ledger_edit_saved"));
      onChanged();
    } catch {
      setMsg(t("ads_ledger_edit_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-ui-rect border border-sam-border p-3 text-[13px]" data-admin-ads-ledger-drawer={l.kind}>
      <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1">
        <dt className="text-sam-muted">{t("ads_ledger_col_kind")}</dt>
        <dd>{x.kindLabel}</dd>
        <dt className="text-sam-muted">{t("ads_ledger_col_location")}</dt>
        <dd data-admin-ads-ledger-drawer-location="1">{x.location}</dd>
        <dt className="text-sam-muted">{t("ads_ledger_col_advertiser")}</dt>
        <dd>{x.advertiser}</dd>
        <dt className="text-sam-muted">{t("ads_ledger_col_status")}</dt>
        <dd data-admin-ads-ledger-drawer-status="1">{x.statusLabel}</dd>
        <dt className="text-sam-muted">{t("ads_ledger_col_period")}</dt>
        <dd>{[item.periodLabel, item.remainingLabel].filter(Boolean).join(" · ") || "—"}</dd>
        <dt className="text-sam-muted">{t("ads_ledger_col_payment")}</dt>
        <dd>{x.payment}</dd>
        <dt className="text-sam-muted">{t("ads_ledger_col_performance")}</dt>
        <dd>{x.performance}</dd>
      </dl>

      <div>
        <p className="mb-1 text-[12px] font-semibold text-sam-muted">{t("ads_ledger_col_shortcuts")}</p>
        <AdminAdsLedgerShortcuts item={item} />
      </div>

      <div className="space-y-2" data-admin-ads-ledger-quick-edit={target ? target.api : "screen"}>
        <p className="text-[12px] font-semibold text-sam-muted">{t("ads_ledger_edit_title")}</p>
        {isBoost ? <p className="text-[12px] text-sam-muted">{t("ads_ledger_edit_boost_only")}</p> : null}
        {l.kind === "feed_member" ? <p className="text-[12px] text-sam-muted">{t("ads_ledger_edit_locked_dest")}</p> : null}
        {target && l.statusTab !== "deleted" && l.statusTab !== "ended" && l.statusTab !== "rejected" ? (
          canEdit ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-[12px] text-sam-muted">{t("ads_ledger_edit_priority")}</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={busy}
                />
              </label>
              {target.api === "feed" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[12px] text-sam-muted">{t("ads_ledger_edit_start")}</span>
                    <input
                      type="datetime-local"
                      className="mt-0.5 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] text-sam-muted">{t("ads_ledger_edit_end")}</span>
                    <input
                      type="datetime-local"
                      className="mt-0.5 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
              ) : null}
              <label className="block">
                <span className="text-[12px] text-sam-muted">{t("ads_ledger_edit_destination")}</span>
                <input
                  type="url"
                  className="mt-0.5 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1"
                  value={dest}
                  placeholder="https://"
                  onChange={(e) => setDest(e.target.value)}
                  disabled={busy}
                />
              </label>
              <AdminActionButton variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
                {t("ads_ledger_edit_save")}
              </AdminActionButton>
            </div>
          ) : (
            <p className="text-[12px] text-sam-muted">{t("ads_ledger_edit_no_perm")}</p>
          )
        ) : !isBoost ? (
          <p className="text-[12px] text-sam-muted">{t("ads_ledger_edit_image_only_screen")}</p>
        ) : null}
        <AdminActionLink href={item.href} variant="secondary" size="sm" data-admin-ads-ledger-open-edit="1">
          {isBoost ? t("ads_ledger_manage") : `${t("ads_ledger_edit_image")} · ${t("ads_ledger_edit_open")}`}
        </AdminActionLink>
        {msg ? (
          <p className="text-[12px] text-sam-fg" role="status">
            {msg}
          </p>
        ) : null}
      </div>

      {l.statusTab !== "deleted" ? (
        deleteKind ? (
          <AdminAdDeleteAction
            kind={deleteKind}
            id={parseWorkspaceEntityId(item.id)}
            title={item.title || x.kindLabel}
            ownerPopup={l.kind === "popup_owner"}
            onDone={() => onChanged()}
          />
        ) : (
          <p className="text-[12px] text-sam-muted">{t("ads_ledger_no_delete_kind")}</p>
        )
      ) : null}
    </section>
  );
}
