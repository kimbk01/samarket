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
  if (value === "off") return ko ? "끄기" : "Off";
  if (value === "badge_on_image") return ko ? "이미지 뱃지" : "Image badge";
  if (value === "benefit_line") return ko ? "혜택 문구" : "Benefit line";
  return ko ? "뱃지 + 문구" : "Badge + line";
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
              {ko ? "제목 (한국어)" : "Title (Korean)"}
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
              {ko ? "제목 (English)" : "Title (English)"}
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
              {ko ? "부제목 (한국어, 선택)" : "Subtitle (Korean, optional)"}
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
              {ko ? "부제목 (English, 선택)" : "Subtitle (English, optional)"}
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
            <span className="text-[13px] font-medium">{ko ? "선반 사용 여부" : "Shelf enabled"}</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-sam-muted">
                {shelf.enabled ? (ko ? "사용 중" : "On") : ko ? "끄기" : "Off"}
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
            {ko ? "데이터 소스" : "Data source"}
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
                <dt className="text-sam-muted">{ko ? "방식" : "Mode"}</dt>
                <dd>{t("admin_stores_popularity_rolling")}</dd>
                <dt className="text-sam-muted">Timezone</dt>
                <dd>{t("admin_stores_popularity_tz")}</dd>
                <dt className="text-sam-muted">{ko ? "지표" : "Metric"}</dt>
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
            {ko ? "최대 노출 개수" : "Max items"}
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
              {ko ? "후보" : "Candidates"} {candidateCount ?? "-"} · {ko ? "앱 표시" : "Shown in app"}{" "}
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
            {ko ? "카드 표현 방식" : "Card presentation"}
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
            {ko ? "적용 이미지 소스" : "Image source"}
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
              {ko
                ? "노출 순서: 항상 마지막 — 「더 많은 매장」은 앱에서 모든 선반 아래에 표시됩니다."
                : "Order: always last — the remaining-stores list renders below every shelf in the app."}
            </p>
          ) : (
            <label className="block text-[12px] font-medium text-sam-muted">
              {ko ? "노출 순서" : "Order"}
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
              {ko ? "노출 시작" : "Schedule start"}
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={normalizeDateTimeLocal(shelf.scheduleStart)}
                onChange={(e) => onUpdate({ scheduleStart: dateTimeLocalToPayload(e.target.value) })}
              />
            </label>
            <label className="block text-[12px] font-medium text-sam-muted">
              {ko ? "노출 종료" : "Schedule end"}
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
              <span className="text-[13px] font-semibold">{ko ? "전체보기 설정" : "Show all"}</span>
              <AdminSwitch
                checked={shelf.productConfig.showAllEnabled}
                onChange={(value) => onUpdateProductConfig({ showAllEnabled: value })}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[12px] font-medium text-sam-muted">
                {ko ? "버튼 문구 (KO)" : "Label (KO)"}
                <input
                  disabled={!shelf.productConfig.showAllEnabled}
                  className={`${INPUT_CLASS} disabled:opacity-50`}
                  value={shelf.productConfig.showAllLabelKo ?? ""}
                  onChange={(e) => onUpdateProductConfig({ showAllLabelKo: e.target.value || null })}
                />
              </label>
              <label className="block text-[12px] font-medium text-sam-muted">
                {ko ? "버튼 문구 (EN)" : "Label (EN)"}
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
                {ko
                  ? "이 데이터 소스와 같은 결과를 보여 주는 목록 화면이 없어 앱에 전체 보기가 표시되지 않습니다."
                  : "No list screen shows the same result as this data source, so Show all is hidden in the app."}
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
                    {ko ? "「더 많은 매장」 광고 삽입" : "Ads in remaining stores"}
                  </p>
                  <p className="text-[12px] text-sam-muted">
                    {ko
                      ? "켜면 집행 중인 매장 광고가 목록 사이에 들어갑니다. 저장해야 앱에 반영됩니다."
                      : "When on, active store ads are inserted into the list. Save to apply."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-sam-muted">{restAdOn ? (ko ? "켜기" : "On") : ko ? "끄기" : "Off"}</span>
                  <AdminSwitch
                    checked={restAdOn}
                    label={ko ? "「더 많은 매장」 광고 삽입" : "Ads in remaining stores"}
                    onChange={(on) => onUpdate({ adIntegration: homeRestAdIntegrationFromToggle(on, shelf.adIntegration) })}
                  />
                </div>
              </div>
              <AdminDeliveryAdHomePolicyPanel restShelfAdIntegration={shelf.adIntegration} />
            </div>
          ) : (
            <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-[12px] text-sam-muted">
              {ko
                ? "이 선반에는 광고가 들어가지 않습니다. 홈 광고는 「더 많은 매장」 선반에서만 켜고 끕니다."
                : "Ads never appear in this shelf. HOME ads are switched only on the remaining-stores shelf."}
            </p>
          )}
        </Field>
      </div>
    );
  }

  return (
    <Field k="operatorMemo">
      <label className="block text-[12px] font-medium text-sam-muted">
        {ko ? "운영 메모" : "Operator memo"}
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
