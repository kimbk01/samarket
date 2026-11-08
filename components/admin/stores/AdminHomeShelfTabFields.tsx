"use client";

/**
 * 5-B HS-01 — HOME 선반 편집 탭 본문. 필드는 탭당 1회 (`HOME_SHELF_ADMIN_TAB_FIELDS`) —
 * 각 필드 묶음에 `data-home-shelf-field` 를 달아 렌더 테스트가 탭 간 중복 0 을 검사한다.
 * 저장 payload 형식은 바꾸지 않는다 (상위 편집기가 같은 DraftShelf 를 PUT).
 */

import type { ReactNode } from "react";
import { isoToManilaLocal, manilaLocalToIso } from "@/lib/launch-intro/schedule";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryAdHomePolicyPanel } from "@/components/admin/stores/AdminDeliveryAdPlacementPolicyPanel";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type { StoresHomeShelfCouponIntegration } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import {
  showAllRouteKeysForDataSource,
  type StoresHomeShelfImageSource,
  type StoresHomeShelfShowAllRouteKey,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import {
  coercePresentationForDataSource,
  presentationsAllowedForDataSource,
  STORES_HOME_DATA_SOURCE_IDS,
  type StoresHomeDataSourceId,
} from "@/lib/stores/product/stores-home-data-source";
import {
  STORES_POPULARITY_WINDOW_DAYS_IDS,
  buildStorePopularityWindowMeta,
  resolvePopularityWindowDays,
} from "@/lib/stores/store-discovery-popular-store";
import type { StoresHomeShelfResolvedConfig } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import {
  HOME_SHELF_ADMIN_IMAGE_OPTIONS,
  homeRestAdIntegrationFromToggle,
  homeShelfAdminImageDisplayValue,
  homeShelfEmptyCandidateReason,
  isHomeRestPaidInsertionOn,
  isHomeRestShelf,
  type HomeShelfAdminFieldKey,
  type HomeShelfAdminTab,
} from "@/lib/stores/product/stores-home-shelf-admin-tabs";
import { translateBy } from "@/lib/i18n/translate-by";

export type AdminHomeDraftShelf = StoresHomeShelfResolvedConfig & { draftMax: string; draftOrder: string };

const ROUTE_OPTIONS: StoresHomeShelfShowAllRouteKey[] = [
  "none",
  "orderNow",
  "popular",
  "discount",
  "topRated",
  "nearby",
  "recommended",
  "allStores",
];
const COUPON_OPTIONS: StoresHomeShelfCouponIntegration[] = ["off", "badge_on_image", "benefit_line", "both"];

const INPUT_CLASS = "mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg";

function couponLabel(value: StoresHomeShelfCouponIntegration, ko: boolean) {
  if (value === "off") return translateBy(ko ? "ko" : "en", "admin_stores_off");
  if (value === "badge_on_image") return translateBy(ko ? "ko" : "en", "admin_stores_image_badge");
  if (value === "benefit_line") return translateBy(ko ? "ko" : "en", "admin_stores_home_shelves_integration_benefit");
  return translateBy(ko ? "ko" : "en", "admin_stores_badge_line");
}

/** H-05 — 어드민 입력·표시 = 필리핀 시간(Asia/Manila), 저장 = ISO instant (launch-intro 와 같은 SSOT). */
function normalizeDateTimeLocal(value: string | null) {
  if (!value) return "";
  return Number.isFinite(Date.parse(value)) ? isoToManilaLocal(value) : value.slice(0, 16);
}

function dateTimeLocalToPayload(value: string) {
  return manilaLocalToIso(value.trim()) ?? null;
}

function Field({ k, children }: { k: HomeShelfAdminFieldKey; children: ReactNode }) {
  return <div data-home-shelf-field={k}>{children}</div>;
}

export type AdminHomeShelfTabFieldsProps = {
  shelf: AdminHomeDraftShelf;
  tab: HomeShelfAdminTab;
  onUpdate: (patch: Partial<AdminHomeDraftShelf>) => void;
  onUpdateProductConfig: (patch: Partial<AdminHomeDraftShelf["productConfig"]>) => void;
  /** 데이터 소스 조건을 만족하는 후보 매장 수 (home-feed 로딩 전 null) */
  candidateCount: number | null;
  /** 앱에 실제로 그려질 수 (null = 미계산) */
  renderedCount: number | null;
  popularityUntilIso: string | null;
  showAllHref: string | null;
};

export function AdminHomeShelfTabFields({
  shelf,
  tab,
  onUpdate,
  onUpdateProductConfig,
  candidateCount,
  renderedCount,
  popularityUntilIso,
  showAllHref,
}: AdminHomeShelfTabFieldsProps) {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const isRest = isHomeRestShelf(shelf);

  if (tab === "basic") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field k="titleKo">
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_home_shelves_col_title_ko")}
              <input
                maxLength={20}
                className={INPUT_CLASS}
                value={shelf.titleKo}
                onChange={(e) => onUpdate({ titleKo: e.target.value })}
              />
              <span className="mt-0.5 block text-right text-[12px]">{shelf.titleKo.length}/20</span>
            </label>
          </Field>
          <Field k="titleEn">
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_home_shelves_col_title_en")}
              <input
                maxLength={40}
                className={INPUT_CLASS}
                value={shelf.titleEn}
                onChange={(e) => onUpdate({ titleEn: e.target.value })}
              />
            </label>
          </Field>
          <Field k="subtitleKo">
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_subtitle_korean_optional")}
              <input
                maxLength={40}
                className={INPUT_CLASS}
                value={shelf.subtitleKo ?? ""}
                onChange={(e) => onUpdate({ subtitleKo: e.target.value })}
              />
              <span className="mt-0.5 block text-right text-[12px]">{(shelf.subtitleKo ?? "").length}/40</span>
            </label>
          </Field>
          <Field k="subtitleEn">
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_subtitle_english_optional")}
              <input
                maxLength={80}
                className={INPUT_CLASS}
                value={shelf.subtitleEn ?? ""}
                onChange={(e) => onUpdate({ subtitleEn: e.target.value })}
              />
            </label>
          </Field>
        </div>
        <Field k="enabled">
          <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
            <span className="text-[13px] font-medium">{t("admin_stores_shelf_enabled")}</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-sam-muted">
                {shelf.enabled ? t("admin_stores_on") : t("admin_stores_off")}
              </span>
              <AdminSwitch checked={shelf.enabled} onChange={(value) => onUpdate({ enabled: value })} />
            </div>
          </div>
        </Field>
      </div>
    );
  }

  if (tab === "data") {
    const days = resolvePopularityWindowDays(shelf.productConfig.popularityWindowDays);
    const meta = buildStorePopularityWindowMeta(days, popularityUntilIso ? new Date(popularityUntilIso) : new Date());
    return (
      <div className="space-y-3">
        <p className="rounded-ui-rect bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-warning">
          {t("admin_stores_home_shelves_ranking_lock")}
        </p>
        <Field k="dataSource">
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_data_source")}
            <select
              className={INPUT_CLASS}
              value={shelf.dataSource}
              onChange={(e) => {
                const dataSource = e.target.value as StoresHomeDataSourceId;
                onUpdate({
                  dataSource,
                  presentation: coercePresentationForDataSource(dataSource, shelf.presentation),
                  productConfig: { ...shelf.productConfig, dataSource },
                });
              }}
            >
              {STORES_HOME_DATA_SOURCE_IDS
                /** H-09 — `rest_stores`(나머지 매장)는 「더 많은 매장」 슬롯에서만 앱이 처리. */
                .filter((option) => option !== "rest_stores" || isRest)
                .map((option) => (
                  <option key={option} value={option}>
                    {t(`admin_stores_home_ds_${option}`)}
                  </option>
                ))}
            </select>
          </label>
        </Field>
        <Field k="popularityWindowDays">
          {shelf.dataSource !== "popular_menu" ? (
            <p className="text-[12px] text-sam-muted">{t("admin_stores_popularity_window_na")}</p>
          ) : (
            <div className="space-y-2 rounded-ui-rect border border-sam-border p-3">
              <label className="block text-[12px] font-medium text-sam-muted">
                {t("admin_stores_popularity_window")}
                <select
                  className={INPUT_CLASS}
                  value={days}
                  onChange={(e) =>
                    onUpdateProductConfig({ popularityWindowDays: resolvePopularityWindowDays(Number(e.target.value)) })
                  }
                >
                  {STORES_POPULARITY_WINDOW_DAYS_IDS.map((option) => (
                    <option key={option} value={option}>
                      {t(`admin_stores_popularity_window_${option}`)}
                    </option>
                  ))}
                </select>
              </label>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-sam-muted">{t("admin_stores_mode")}</dt>
                <dd>{t("admin_stores_popularity_rolling")}</dd>
                <dt className="text-sam-muted">Timezone</dt>
                <dd>{t("admin_stores_popularity_tz")}</dd>
                <dt className="text-sam-muted">{t("admin_stores_metric")}</dt>
                <dd>{t("admin_stores_popularity_metric")}</dd>
                <dt className="text-sam-muted">{t("admin_stores_popularity_range")}</dt>
                <dd className="break-all">
                  {meta.popularitySinceIso} ~ {meta.popularityUntilIso}
                </dd>
              </dl>
              <p className="text-[12px] leading-snug text-sam-muted">{t("admin_stores_popularity_window_limitation")}</p>
            </div>
          )}
        </Field>
        <Field k="max">
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_max_items")}
            <input
              type="number"
              min={0}
              className={INPUT_CLASS}
              value={shelf.draftMax}
              onChange={(e) => onUpdate({ draftMax: e.target.value })}
            />
          </label>
        </Field>
        <Field k="candidates">
          <div className="rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]" data-home-shelf-candidates="1">
            <p className="font-semibold text-sam-fg">
              {t("admin_stores_candidates")} {candidateCount ?? "-"} · {t("admin_stores_shown_in_app")}{" "}
              {renderedCount ?? "-"}
            </p>
            {candidateCount === 0 ? (
              <p className="mt-1 text-[12px] text-sam-warning" data-home-shelf-empty-reason={shelf.dataSource}>
                {homeShelfEmptyCandidateReason(shelf.dataSource, ko)}
              </p>
            ) : null}
          </div>
        </Field>
      </div>
    );
  }

  if (tab === "presentation") {
    const allowed = presentationsAllowedForDataSource(shelf.dataSource);
    const presentation = allowed.includes(shelf.presentation) ? shelf.presentation : allowed[0]!;
    return (
      <div className="space-y-3">
        <Field k="presentation">
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_card_presentation")}
            <select
              className={INPUT_CLASS}
              value={presentation}
              onChange={(e) => onUpdate({ presentation: e.target.value as StoresHomePresentationPatternId })}
            >
              {allowed.map((option) => (
                <option key={option} value={option}>
                  {t(`admin_stores_home_shelves_pres_${option}`)}
                </option>
              ))}
            </select>
          </label>
        </Field>
        <Field k="imageSource">
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_image_source")}
            <select
              className={INPUT_CLASS}
              value={homeShelfAdminImageDisplayValue(shelf.productConfig.imageSource)}
              onChange={(e) => onUpdateProductConfig({ imageSource: e.target.value as StoresHomeShelfImageSource })}
            >
              {HOME_SHELF_ADMIN_IMAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`admin_stores_home_shelves_image_${option}`)}
                </option>
              ))}
            </select>
          </label>
        </Field>
      </div>
    );
  }

  if (tab === "exposure") {
    const allowedRoutes = showAllRouteKeysForDataSource(shelf.dataSource);
    const routeValue = allowedRoutes.includes(shelf.productConfig.showAllRouteKey)
      ? shelf.productConfig.showAllRouteKey
      : allowedRoutes[0];
    return (
      <div className="space-y-3">
        <Field k="order">
          {isRest ? (
            <p
              className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-[13px] text-sam-fg"
              data-home-shelf-order-locked="1"
            >
              {t("admin_stores_order_always_last_remaining_stores_list")}
            </p>
          ) : (
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_order")}
              <input
                type="number"
                min={0}
                className={INPUT_CLASS}
                value={shelf.draftOrder}
                onChange={(e) => onUpdate({ draftOrder: e.target.value })}
              />
            </label>
          )}
        </Field>
        <Field k="schedule">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_schedule_start")}
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={normalizeDateTimeLocal(shelf.scheduleStart)}
                onChange={(e) => onUpdate({ scheduleStart: dateTimeLocalToPayload(e.target.value) })}
              />
            </label>
            <label className="block text-[12px] font-medium text-sam-muted">
              {t("admin_stores_schedule_end")}
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={normalizeDateTimeLocal(shelf.scheduleEnd)}
                onChange={(e) => onUpdate({ scheduleEnd: dateTimeLocalToPayload(e.target.value) })}
              />
            </label>
          </div>
        </Field>
        <Field k="showAll">
          <div className="rounded-ui-rect border border-sam-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold">{t("admin_stores_show_all")}</span>
              <AdminSwitch
                checked={shelf.productConfig.showAllEnabled}
                onChange={(value) => onUpdateProductConfig({ showAllEnabled: value })}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[12px] font-medium text-sam-muted">
                {t("admin_stores_label_ko")}
                <input
                  disabled={!shelf.productConfig.showAllEnabled}
                  className={`${INPUT_CLASS} disabled:opacity-50`}
                  value={shelf.productConfig.showAllLabelKo ?? ""}
                  onChange={(e) => onUpdateProductConfig({ showAllLabelKo: e.target.value || null })}
                />
              </label>
              <label className="block text-[12px] font-medium text-sam-muted">
                {t("admin_stores_label_en")}
                <input
                  disabled={!shelf.productConfig.showAllEnabled}
                  className={`${INPUT_CLASS} disabled:opacity-50`}
                  value={shelf.productConfig.showAllLabelEn ?? ""}
                  onChange={(e) => onUpdateProductConfig({ showAllLabelEn: e.target.value || null })}
                />
              </label>
            </div>
            {/* H-15 — 데이터 소스와 같은 결과를 주는 목록만 선택지로 제공. */}
            {allowedRoutes.length === 0 || !routeValue ? (
              <p className="mt-2 text-[12px] text-sam-muted">
                {t("admin_stores_no_list_screen_shows_same_result")}
              </p>
            ) : (
              <select
                disabled={!shelf.productConfig.showAllEnabled}
                className={`${INPUT_CLASS} mt-2 disabled:opacity-50`}
                value={routeValue}
                onChange={(e) =>
                  onUpdateProductConfig({ showAllRouteKey: e.target.value as StoresHomeShelfShowAllRouteKey })
                }
              >
                {ROUTE_OPTIONS.filter((option) => allowedRoutes.includes(option)).map((option) => (
                  <option key={option} value={option}>
                    {t(`admin_stores_home_shelves_route_${option}`)}
                  </option>
                ))}
              </select>
            )}
            {showAllHref ? <p className="mt-1.5 font-mono text-[12px] text-sam-muted">{showAllHref}</p> : null}
          </div>
        </Field>
      </div>
    );
  }

  if (tab === "coupon_ad") {
    const restAdOn = isHomeRestPaidInsertionOn(shelf.adIntegration);
    return (
      <div className="space-y-3">
        <Field k="couponIntegration">
          <label className="block text-[12px] font-medium text-sam-muted">
            {t("admin_stores_home_shelves_col_coupon")}
            <select
              disabled={!shelf.supportsCouponIntegration}
              className={`${INPUT_CLASS} disabled:opacity-50`}
              value={shelf.couponIntegration}
              onChange={(e) => onUpdate({ couponIntegration: e.target.value as StoresHomeShelfCouponIntegration })}
            >
              {COUPON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {couponLabel(option, ko)}
                </option>
              ))}
            </select>
          </label>
        </Field>
        <Field k="adIntegration">
          {isRest ? (
            <div className="space-y-3">
              {/* HS-03 — 「더 많은 매장」 유료 삽입 on/off 단일 기준 (저장 시 레거시 레일 동기화) */}
              <div className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium text-sam-fg">
                    {t("admin_stores_ads_in_remaining_stores")}
                  </p>
                  <p className="text-[12px] text-sam-muted">
                    {t("admin_stores_when_on_active_store_ads_are")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-sam-muted">{restAdOn ? t("admin_stores_on_2") : t("admin_stores_off")}</span>
                  <AdminSwitch
                    checked={restAdOn}
                    label={t("admin_stores_ads_in_remaining_stores")}
                    onChange={(on) => onUpdate({ adIntegration: homeRestAdIntegrationFromToggle(on, shelf.adIntegration) })}
                  />
                </div>
              </div>
              <AdminDeliveryAdHomePolicyPanel restShelfAdIntegration={shelf.adIntegration} />
            </div>
          ) : (
            <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[12px] text-sam-muted">
              {t("admin_stores_ads_never_appear_in_this_shelf")}
            </p>
          )}
        </Field>
      </div>
    );
  }

  return (
    <Field k="operatorMemo">
      <label className="block text-[12px] font-medium text-sam-muted">
        {t("admin_stores_operator_memo")}
        <textarea
          maxLength={200}
          rows={7}
          className="mt-1 w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
          value={shelf.productConfig.operatorMemo ?? ""}
          onChange={(e) => onUpdateProductConfig({ operatorMemo: e.target.value || null })}
        />
        <span className="mt-0.5 block text-right text-[12px]">{(shelf.productConfig.operatorMemo ?? "").length}/200</span>
      </label>
    </Field>
  );
}
