import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IMPORT_LINE = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';

const TARGETS = [
  "components/rider/RiderHomeClient.tsx",
  "components/rider/RiderOrdersClient.tsx",
  "components/rider/RiderOrderDetailClient.tsx",
  "components/orders/OrdersHubStoreAdminAccess.tsx",
  "components/member-benefits/MemberBenefitCard.tsx",
  "components/favorites/FavoriteProductsView.tsx",
  "components/favorites/FavoritePostTradeActions.tsx",
  "components/favorites/FavoriteToggleButton.tsx",
  "components/favorites/PostFavoriteButton.tsx",
  "components/favorites/FavoriteProductCard.tsx",
  "components/favorites/FavoriteFilterBar.tsx",
  "components/product/form/ProductForm.tsx",
  "components/product/form/ProductConditionSelect.tsx",
  "components/product/form/ProductPriceField.tsx",
  "components/product/form/ProductImagePicker.tsx",
  "components/product/form/ProductLocationSelect.tsx",
  "components/product/form/ProductCategorySelect.tsx",
  "components/product/ProductStatusBadge.tsx",
  "components/product/ProductCard.tsx",
  "components/product/detail/ProductImageGallery.tsx",
  "components/product/detail/ProductDetailHeaderToolbar.tsx",
  "components/product/SellerListingStateControl.tsx",
  "components/products/ProductTradeEditPageClient.tsx",
  "components/category/CategoryListSubheader.tsx",
  "components/category/CategoryListLayout.tsx",
  "components/category/CategoryEmptyState.tsx",
  "components/market/JobListingKindTabs.tsx",
  "components/market/MarketCategoryFeed.tsx",
  "components/reports/ReportReasonSelector.tsx",
  "components/reports/ReportActionSheet.tsx",
  "components/reports/BlockedUserList.tsx",
  "components/reports/UserBlockButton.tsx",
  "components/reports/BlockedUserCard.tsx",
  "components/reports/BlockActionSheet.tsx",
  "components/recent-viewed/RecentViewedList.tsx",
  "components/recent-viewed/RecentViewedCard.tsx",
  "components/regions/SavedRegionCard.tsx",
  "components/regions/RegionSelectorForm.tsx",
  "components/regions/PrimaryRegionBadge.tsx",
  "components/regions/MyRegionSettingsView.tsx",
  "components/layout/SearchButton.tsx",
  "components/ui/MobileConfirmBottomSheet.tsx",
  "components/ui/TumblerTimePickerDialog.tsx",
  "components/home-feed/HomeTradeReelsSideRail.tsx",
  "components/home-feed/HomeFeedViewExperimental.tsx",
  "components/home-feed/HomeFeedCard.tsx",
];

function ensureImport(content) {
  if (content.includes("useI18n")) return content;
  if (!content.includes('"use client"')) return content;
  const idx = content.indexOf("\n", content.indexOf('"use client"'));
  return content.slice(0, idx + 1) + IMPORT_LINE + content.slice(idx + 1);
}

function addHooks(content) {
  let n = 0;
  return content.replace(/export function (\w+)\([^)]*\)\s*\{/g, (match, _name, offset) => {
    const slice = content.slice(offset, offset + match.length + 120);
    if (slice.includes("useI18n()")) return match;
    n++;
    return match + "\n  const { t } = useI18n();";
  });
}

const REPLACEMENTS = [
  ['불러오는 중…', '{t("common_loading")}'],
  ['불러오는 중...', '{t("common_loading")}'],
  ['"common_loading"', 't("common_loading")'],
  ['{t("common_loading")}', 't("common_loading")'],
  ['취소', '{t("common_cancel")}'],
  ['다시 시도', '{t("common_retry")}'],
  ['닫기', '{t("common_close")}'],
  ['없음', '{t("common_none")}'],
  ['로그인', '{t("common_login")}'],
  ['검색', '{t("common_search")}'],
  ['삭제', '{t("common_delete")}'],
  ['수락', '{t("common_accept")}'],
  ['거절', '{t("common_reject")}'],
  ['aria-label="확인"', 'aria-label={t("ui_sheet_confirm_aria")}'],
  ['ariaLabel = "확인"', 'ariaLabel = t("ui_sheet_confirm_aria")'],
  ['aria-label="닫기"', 'aria-label={t("ui_sheet_close_aria")}'],
  ['ariaLabel = "선택"', 'ariaLabel = t("ui_sheet_choice_aria")'],
  ['title = "시간 설정"', 'title = t("ui_time_picker_title")'],
  ['>완료<', '>{t("ui_time_picker_done")}<'],
  ['tt(opt.label)', 't(opt.labelKey)'],
  ['r.label}', 't(r.labelKey)}'],
  ['onChange(r.code, r.label)', 'onChange(r.code, t(r.labelKey))'],
  ['selected?.label ?? reasonLabel', 't(selected?.labelKey ?? "ui_report_reason_other") ?? reasonLabel'],
];

// Per-file overrides applied after generic (longer first)
const FILE_REPLACEMENTS = {
  "components/rider/RiderHomeClient.tsx": [
    ['j.error ?? "불러오기 실패"', 'j.error ?? t("ui_rider_load_failed")'],
    ['j.error ?? "상태 변경 실패"', 'j.error ?? t("ui_rider_status_change_failed")'],
    ['<h1 className={Sam.text.pageTitle}>라이더 센터</h1>', '<h1 className={Sam.text.pageTitle}>{t("ui_rider_center_title")}</h1>'],
    ['? "로그인 후 이용할 수 있습니다."', '? t("ui_rider_login_required")'],
    [': "이 계정은 라이더로 등록되어 있지 않습니다. 관리자에게 문의하세요."}', ': t("ui_rider_not_registered")}'],
    ['<h1 className={Sam.text.pageTitle}>라이더</h1>', '<h1 className={Sam.text.pageTitle}>{t("ui_rider_title")}</h1>'],
    ['온라인 상태와 배달 목록을 관리합니다.', '{t("ui_rider_subtitle")}'],
    ['주문 목록', '{t("ui_rider_orders_link")}'],
    ['<h2 className={Sam.text.sectionTitle}>내 상태</h2>', '<h2 className={Sam.text.sectionTitle}>{t("ui_rider_my_status")}</h2>'],
    ['<dt className="text-sam-muted">온라인</dt>', '<dt className="text-sam-muted">{t("ui_rider_online_label")}</dt>'],
    ['{rider.is_online ? "예" : "아니오"}', '{rider.is_online ? t("ui_rider_yes") : t("ui_rider_no")}'],
    ['<dt className="text-sam-muted">모드</dt>', '<dt className="text-sam-muted">{t("ui_rider_mode_label")}</dt>'],
    ['>온라인</', '>{t("ui_rider_go_online")}</'],
    ['>오프라인</', '>{t("ui_rider_go_offline")}</'],
    ['업무(active)', '{t("ui_rider_mode_active")}'],
    ['배달중 표시', '{t("ui_rider_mode_delivering")}'],
    ['>휴식</', '>{t("ui_rider_mode_break")}</'],
    ['<h2 className={Sam.text.sectionTitle}>오늘 요약</h2>', '<h2 className={Sam.text.sectionTitle}>{t("ui_rider_today_summary")}</h2>'],
    ['<li>대기 배차: {counts.queue}</li>', '<li>{t("ui_rider_queue_count", { count: counts.queue })}</li>'],
    ['<li>진행 중: {counts.active}</li>', '<li>{t("ui_rider_active_count", { count: counts.active })}</li>'],
    ['<li>오늘 완료: {counts.delivered_today}</li>', '<li>{t("ui_rider_delivered_today_count", { count: counts.delivered_today })}</li>'],
    ['>새로고침</', '>{t("ui_rider_refresh")}</'],
  ],
};

for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn("skip missing", rel);
    continue;
  }
  let c = fs.readFileSync(fp, "utf8");
  const before = c;
  c = ensureImport(c);
  if (!c.includes("useI18n()") && c.includes('"use client"')) {
    c = addHooks(c);
  }
  const reps = [...(FILE_REPLACEMENTS[rel] ?? []), ...REPLACEMENTS];
  for (const [from, to] of reps) {
    if (c.includes(from)) c = c.split(from).join(to);
  }
  if (c !== before) {
    fs.writeFileSync(fp, c);
    console.log("updated", rel);
  } else {
    console.log("unchanged", rel);
  }
}
