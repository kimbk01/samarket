"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { WalletGiftFriendPicker } from "@/components/gift-certificate/WalletGiftFriendPicker";
import { CommerceEmptyState } from "./CommerceEmptyState";
import {
  markCommerceHubFetchUnauthed,
  useCommerceHubTabFetch,
} from "./useCommerceHubTabFetch";
import {
  canonicalHubHref,
  giftMallHref,
  ownedGiftInstanceHref,
  type GiftSubTab,
} from "@/lib/delivery/customer/commerce-hub-nav";
import type { GiftWalletPayload, GiftWalletTransfer } from "@/lib/gift-certificate/load-gift-wallet";
import { formatGiftInstanceExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import {
  CommerceHubSegmentTabs,
  CommercePrimaryCtaButton,
  CommercePrimaryCtaLink,
} from "./CommerceHubSegmentTabs";
import { GIFT_CARD_RESPONSIVE_GRID_CLASS } from "@/lib/gift-certificate/gift-visual-layout";
import { Sam } from "@/lib/ui/sam-component-classes";
import { formatMypageDate, formatMypageMoney } from "@/lib/mypage/format-mypage-date";
// 기간·쪽 이동은 포인트 화면과 같은 부품 (C-4)
import { CommissionPeriodFilter, LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { GIFT_HISTORY_PAGE_SIZE } from "@/lib/gift-certificate/gift-wallet-history";
import {
  GiftWalletPeriodSummaryCard,
  useGiftWalletHistory,
  type GiftWalletHistoryState,
} from "./CustomerGiftWalletHistory";

/** 「사용 완료」·「보낸 선물」 위 — 기간 칩 + 기간 합계 (C-4) */
function GiftHistoryHeader({ history, lang }: { history: GiftWalletHistoryState; lang: "ko" | "en" }) {
  const pick = (ko: string, en: string) => (lang === "en" ? en : ko);
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div data-testid="gift-wallet-period-filter">
        <CommissionPeriodFilter
          period={history.period.period}
          fromDay={history.period.fromDay ?? ""}
          toDay={history.period.toDay ?? ""}
          lang={lang}
          onChange={(next) =>
            history.changePeriod(
              next.period === "custom"
                ? { period: "custom", fromDay: next.fromDay, toDay: next.toDay }
                : { period: next.period }
            )
          }
        />
      </div>
      {history.periodCheck !== "ok" ? (
        <p
          className={`rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-helper ${
            history.periodCheck === "inverted" ? "text-sam-danger" : "text-sam-muted"
          }`}
          role={history.periodCheck === "inverted" ? "alert" : "note"}
          data-testid="gift-wallet-period-invalid"
        >
          {history.periodCheck === "inverted"
            ? pick("시작일이 종료일보다 늦습니다", "The start date is after the end date")
            : pick("시작일과 종료일을 모두 고르세요", "Choose both a start and an end date")}
        </p>
      ) : (
        <GiftWalletPeriodSummaryCard summary={history.summary} error={history.summaryError} lang={lang} />
      )}
    </div>
  );
}

function GiftHistoryPager({ history, lang }: { history: GiftWalletHistoryState; lang: "ko" | "en" }) {
  if (history.total == null) return null;
  return (
    <div data-testid="gift-wallet-history-pager" className="pb-8">
      <LedgerPager
        offset={history.page * GIFT_HISTORY_PAGE_SIZE}
        pageSize={GIFT_HISTORY_PAGE_SIZE}
        total={history.total}
        loading={history.loading}
        lang={lang}
        onChange={(offset) => {
          history.goPage(offset);
          if (typeof window !== "undefined") window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}
function useGiftExpiryLabel() {
  const { safeT } = useI18n();
  return (validUntil: string | null | undefined) =>
    formatGiftInstanceExpirationDisplay({
      validUntil,
      noExpiryLabel: safeT("gift_portrait_expiry_none"),
    });
}

const GIFT_TABS: GiftSubTab[] = ["owned", "received", "sent", "used"];

const TAB_KEY: Record<
  GiftSubTab,
  | "commerce_hub_gift_tab_owned"
  | "commerce_hub_gift_tab_received"
  | "commerce_hub_gift_tab_sent"
  | "commerce_hub_gift_tab_used"
> = {
  owned: "commerce_hub_gift_tab_owned",
  received: "commerce_hub_gift_tab_received",
  sent: "commerce_hub_gift_tab_sent",
  used: "commerce_hub_gift_tab_used",
};

async function fetchWallet(signal: AbortSignal): Promise<{ authed: boolean; wallet: GiftWalletPayload | null }> {
  const res = await fetch("/api/me/gift-certificates/wallet", {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (res.status === 401) {
    markCommerceHubFetchUnauthed("commerce-hub:gifts");
    return { authed: false, wallet: null };
  }
  // 실패는 throw — 빈 지갑으로 캐시하지 않는다
  if (!res.ok) throw new Error(`gift_wallet_${res.status}`);
  const json = (await res.json()) as { ok?: boolean; wallet?: GiftWalletPayload };
  if (json.ok !== true) throw new Error("gift_wallet_not_ok");
  return { authed: true, wallet: json.wallet ?? null };
}

function transferStatusLabel(
  status: string,
  safeT: ReturnType<typeof useI18n>["safeT"]
): string {
  const s = status.toUpperCase();
  if (s === "PENDING") {
    return safeT("commerce_hub_transfer_status_pending");
  }
  if (s === "ACCEPTED") {
    return safeT("commerce_hub_transfer_status_accepted");
  }
  if (s === "REJECTED") {
    return safeT("commerce_hub_transfer_status_rejected");
  }
  if (s === "CANCELLED") {
    return safeT("commerce_hub_transfer_status_cancelled");
  }
  return status;
}

function TransferCard({
  transfer,
  direction,
  onCancel,
  onReload,
}: {
  transfer: GiftWalletTransfer;
  direction: "received" | "sent";
  onCancel?: () => void;
  onReload?: () => void;
}) {
  const { safeT } = useI18n();
  const scope = transfer.giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const peerName =
    direction === "received" ? transfer.senderDisplayName : transfer.recipientDisplayName;
  const pending = transfer.status.toUpperCase() === "PENDING";

  async function act(kind: "accept" | "reject") {
    if (!onReload) return;
    if (
      kind === "reject" &&
      !(await dibayConfirm({
        title: safeT("popup_q_reject_gift"),
        cancelLabel: safeT("common_cancel"),
        confirmLabel: safeT("common_reject"),
        confirmTone: "destructive",
      }))
    ) {
      return;
    }
    await fetch(
      `/api/me/gift-certificates/transfers/${encodeURIComponent(transfer.id)}/${kind}`,
      { method: "POST", credentials: "include" }
    );
    onReload();
  }

  return (
    <GiftVisualCard
      visual={{
        giftScope: scope,
        imageUrl: transfer.imageUrl,
        storeLogoUrl: transfer.storeLogoUrl,
        storeName: transfer.storeName,
        title: transfer.title,
      }}
      surface="transfer"
      size="md"
      title={transfer.title}
      issuerName={transfer.storeName}
      faceValue={transfer.faceValue}
      remainingBalance={transfer.remainingBalance}
      purchasePrice={transfer.purchasePrice}
      expirationDisplay={formatGiftInstanceExpirationDisplay({
        validUntil: transfer.validUntil,
        noExpiryLabel: safeT("gift_portrait_expiry_none"),
      })}
      showValidity
      publicGiftNumber={transfer.publicGiftNumber}
      showGiftNumber={Boolean(transfer.publicGiftNumber?.trim())}
      statusLabel={transferStatusLabel(transfer.status, safeT)}
      footer={
        <div className="space-y-2">
          {peerName ? (
            <p className="text-sm text-sam-muted">
              {direction === "received"
                ? safeT("commerce_hub_transfer_from_sender")
                : safeT("commerce_hub_transfer_to_recipient")}
              : <span className="font-medium text-sam-fg">{peerName}</span>
            </p>
          ) : null}
          {direction === "received" && pending ? (
            <div className="flex gap-2">
              <CommercePrimaryCtaButton
                className="min-h-[44px] flex-1 px-3"
                onClick={() => void act("accept")}
              >
                {safeT("gift_cert_chat_accept")}
              </CommercePrimaryCtaButton>
              <button
                type="button"
                className={`${Sam.btn.secondary} min-h-[44px] flex-1 px-3 text-sm`}
                onClick={() => void act("reject")}
              >
                {safeT("gift_cert_chat_reject")}
              </button>
            </div>
          ) : null}
          {direction === "sent" && pending && onCancel ? (
            <button type="button" className={`${Sam.btn.secondary} min-h-[44px] w-full px-3 text-sm`} onClick={onCancel}>
              {safeT("gift_u3_wallet_cancel_gift")}
            </button>
          ) : null}
        </div>
      }
    />
  );
}

/** Gifts tab body — URL `giftTab` is source of truth. */
export function CustomerGiftWalletBody({
  giftTab,
  from,
  refresh = false,
}: {
  giftTab: GiftSubTab;
  from?: string | null;
  refresh?: boolean;
}) {
  const { t, safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const formatExpiry = useGiftExpiryLabel();
  const [sendInstanceId, setSendInstanceId] = useState<string | null>(null);
  const { data, ready, authed, error, reload } = useCommerceHubTabFetch({
    cacheKey: "commerce-hub:gifts",
    enabled: true,
    refresh,
    fetcher: fetchWallet,
  });

  const wallet = data?.wallet ?? null;
  /** 사용 완료·보낸 선물 = 서버 쪽 이동·기간 합계 (C-4) — 보유·받은 선물은 지금 상태라 기간 없음 */
  const history = useGiftWalletHistory(giftTab === "used" || giftTab === "sent" ? giftTab : null);
  const reloadAll = () => {
    reload();
    history.reload();
  };
  const historyDim = history.loading && history.loaded ? "opacity-50 transition-opacity" : "";
  const isAuthed = data?.authed ?? authed;
  const browseHref = giftMallHref({ from });

  const ownedRows = useMemo(() => {
    if (!wallet) return [];
    return [...wallet.available, ...wallet.locked];
  }, [wallet]);

  const counts = useMemo(
    () => ({
      owned: ownedRows.length,
      received: wallet?.pendingTransfers.length ?? 0,
      sent: wallet?.sentTransfers.length ?? 0,
      used: wallet?.fullyRedeemed.length ?? 0,
    }),
    [wallet, ownedRows.length]
  );

  return (
    <div data-customer-gift-wallet="1" data-wallet-ready={ready ? "1" : "0"}>
      <CommerceHubSegmentTabs
        tabs={GIFT_TABS}
        activeId={giftTab}
        hrefFor={(id) => canonicalHubHref("gifts", { giftTab: id, from })}
        labelFor={(id) =>
          safeT(TAB_KEY[id], {
            fallbackKo:
              id === "owned"
                ? "보유"
                : id === "received"
                  ? "받은 선물"
                  : id === "sent"
                    ? "보낸 선물"
                    : "사용 완료",
            fallbackEn:
              id === "owned" ? "Owned" : id === "received" ? "Received" : id === "sent" ? "Sent" : "Used",
          })
        }
        countFor={(id) => (ready && data ? counts[id] : null)}
        dataAttr="data-gift-wallet-tab"
      />

      <div className="mb-3 flex flex-col gap-2">
        <CommercePrimaryCtaLink href={browseHref} data-gift-wallet-buy-cta="1">
          {safeT("commerce_hub_gift_buy_cta")}
        </CommercePrimaryCtaLink>
      </div>
      {!ready ? (
        <GiftWalletCardsSkeleton />
      ) : !isAuthed ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_certificate_wallet_login")}
        </p>
      ) : error && !data ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center" data-wallet-error="1">
          <p className="text-sm text-sam-muted">{t("common_fetch_list_failed")}</p>
          <button type="button" className="sam-btn sam-btn--secondary sam-btn--sm" onClick={reload}>
            {t("common_retry")}
          </button>
        </div>
      ) : giftTab === "owned" ? (
        ownedRows.length === 0 ? (
          <CommerceEmptyState
            title={safeT("commerce_hub_gifts_empty_owned_title")}
            ctaHref={browseHref}
            ctaLabel={safeT("commerce_hub_gift_browse_cta")}
          />
        ) : (
          <ul className={GIFT_CARD_RESPONSIVE_GRID_CLASS}>
            {ownedRows.map((row) => {
              const locked = row.status === "GIFT_LOCKED";
              const canSend = row.transferable && !locked && row.status === "ACTIVE";
              return (
                <li key={row.id}>
                  <GiftVisualCard
                    visual={{
                      giftScope: row.giftScope,
                      imageUrl: row.imageUrl,
                      storeLogoUrl: row.storeLogoUrl,
                      storeName: row.storeName,
                      title: row.title,
                    }}
                    surface="wallet"
                    size="md"
                    title={row.title}
                    issuerName={row.storeName}
                    faceValue={row.faceValue}
                    purchasePrice={row.purchasePrice}
                    publicGiftNumber={row.publicGiftNumber}
                    showGiftNumber={Boolean(row.publicGiftNumber?.trim())}
                    expirationDisplay={formatExpiry(row.validUntil)}
                    showValidity
                    statusLabel={
                      locked
                        ? safeT("gift_u3_wallet_pending_lock")
                        : undefined
                    }
                    detailHref={ownedGiftInstanceHref(row.id, { from, giftTab: "owned" })}
                    showSend={canSend}
                    onSend={() => setSendInstanceId(row.id)}
                    sendDisabled={!canSend}
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : giftTab === "received" ? (
        !wallet || wallet.pendingTransfers.length === 0 ? (
          <CommerceEmptyState
            title={safeT("gift_certificate_wallet_empty")}
          />
        ) : (
          <ul className={GIFT_CARD_RESPONSIVE_GRID_CLASS}>
            {wallet.pendingTransfers.map((t) => (
              <li key={t.id}>
                <TransferCard transfer={t} direction="received" onReload={reloadAll} />
              </li>
            ))}
          </ul>
        )
      ) : giftTab === "sent" ? (
        <>
        <GiftHistoryHeader history={history} lang={lang} />
        {history.periodCheck !== "ok" ? null : !history.loaded && !history.error ? (
          <GiftWalletCardsSkeleton />
        ) : history.error && !history.loaded ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" data-wallet-error="1">
            <p className="text-sm text-sam-muted">{t("common_fetch_list_failed")}</p>
            <button type="button" className="sam-btn sam-btn--secondary sam-btn--sm" onClick={history.reload}>
              {t("common_retry")}
            </button>
          </div>
        ) : history.sentItems.length === 0 ? (
          <CommerceEmptyState
            title={safeT("gift_certificate_wallet_empty")}
          />
        ) : (
          <div className={historyDim}>
          <ul className={GIFT_CARD_RESPONSIVE_GRID_CLASS}>
            {history.sentItems.map((t) => (
              <li key={t.id}>
                <TransferCard
                  transfer={t}
                  direction="sent"
                  onCancel={() => {
                    void (async () => {
                      /** 브라우저 기본 확인창 → 앱 공통 확인창 (팝업 SSOT B3 · 같은 문구 · 확인 시 같은 요청) */
                      if (
                        !(await dibayConfirm({
                          title: safeT("popup_q_cancel_gift"),
                          cancelLabel: safeT("common_cancel"),
                          confirmLabel: safeT("popup_btn_cancel_gift"),
                          confirmTone: "destructive",
                        }))
                      ) {
                        return;
                      }
                      await fetch(
                        `/api/me/gift-certificates/transfers/${encodeURIComponent(t.id)}/cancel`,
                        { method: "POST", credentials: "include" }
                      );
                      reloadAll();
                    })();
                  }}
                />
              </li>
            ))}
          </ul>
          <GiftHistoryPager history={history} lang={lang} />
          </div>
        )}
        </>
      ) : (
        <>
        <GiftHistoryHeader history={history} lang={lang} />
        {history.periodCheck !== "ok" ? null : !history.loaded && !history.error ? (
          <GiftWalletCardsSkeleton />
        ) : history.error && !history.loaded ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" data-wallet-error="1">
            <p className="text-sm text-sam-muted">{t("common_fetch_list_failed")}</p>
            <button type="button" className="sam-btn sam-btn--secondary sam-btn--sm" onClick={history.reload}>
              {t("common_retry")}
            </button>
          </div>
        ) : history.usedItems.length === 0 ? (
        <CommerceEmptyState
          title={safeT("gift_certificate_wallet_empty")}
        />
      ) : (
        <div className={historyDim}>
        <ul className="min-w-0 space-y-3">
          {history.usedItems.map((row) => {
            const latest = row.redemptionHistory?.[0];
            return (
              <li key={row.id}>
                <GiftVisualCard
                  visual={{
                    giftScope: row.giftScope,
                    imageUrl: row.imageUrl,
                    storeLogoUrl: row.storeLogoUrl,
                    storeName: row.storeName,
                    title: row.title,
                  }}
                  surface="used"
                  size="md"
                  faded
                  title={row.title}
                  issuerName={row.storeName}
                  faceValue={row.faceValue}
                  purchasePrice={row.purchasePrice}
                  publicGiftNumber={row.publicGiftNumber}
                  showGiftNumber={Boolean(row.publicGiftNumber?.trim())}
                  expirationDisplay={formatExpiry(row.validUntil)}
                  showValidity
                  detailHref={ownedGiftInstanceHref(row.id, { from, giftTab: "used" })}
                  footer={
                    latest ? (
                      <dl className="space-y-1 text-xs text-sam-muted" data-gift-used-summary="1">
                        <div className="flex justify-between gap-2">
                          <dt>
                            {safeT("commerce_hub_gift_applied_label")}
                          </dt>
                          <dd className="tabular-nums text-sam-fg">{formatMypageMoney(latest.redeemedAmount)}</dd>
                        </div>
                        {latest.forfeitedAmount > 0 ? (
                          <div className="flex justify-between gap-2">
                            <dt>
                              {safeT("commerce_hub_gift_forfeited_label")}
                            </dt>
                            <dd className="tabular-nums text-sam-fg">{formatMypageMoney(latest.forfeitedAmount)}</dd>
                          </div>
                        ) : null}
                        {latest.storeName ? (
                          <div className="flex justify-between gap-2">
                            <dt>
                              {safeT("commerce_hub_used_latest_store")}
                            </dt>
                            <dd className="truncate text-sam-fg">{latest.storeName}</dd>
                          </div>
                        ) : null}
                        {latest.redeemedAt ? (
                          <div className="flex justify-between gap-2">
                            <dt>
                              {safeT("commerce_hub_gift_used_at_label")}
                            </dt>
                            {/* 사용 일시 — PHT 연도·시각까지 (C-4 · 예전엔 UTC 원문 그대로) */}
                            <dd className="tabular-nums text-sam-fg" data-testid="gift-used-at">
                              {formatMypageDate(latest.redeemedAt, { style: "datetime", lang: language }) || "—"}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : row.latestRedemptionStoreName ? (
                      <p className="text-xs text-sam-muted">
                        {safeT("commerce_hub_used_latest_store")}
                        : {row.latestRedemptionStoreName}
                      </p>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
        <GiftHistoryPager history={history} lang={lang} />
        </div>
        )}
        </>
      )}
      {sendInstanceId ? (
        <WalletGiftFriendPicker
          open
          instanceId={sendInstanceId}
          onClose={() => {
            setSendInstanceId(null);
            reloadAll();
          }}
        />
      ) : null}
    </div>
  );
}

/** S45 목록 스켈레톤 — 상품권 카드 3 ("…" 대체). 탭·[상품권 사기]는 실제로 먼저 그린다. */
function GiftWalletCardsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="gift-wallet-skeleton" className="min-w-0 space-y-3 pb-8">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          data-skeleton-row=""
          className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3"
        >
          <span className={`block h-24 w-full ${bone}`} />
          <span className={`mt-3 block h-4 w-[55%] ${bone}`} />
          <span className={`mt-2 block h-3 w-[35%] ${bone}`} />
        </li>
      ))}
    </ul>
  );
}
