/**
 * 광고(ads) 워크스페이스 Admin 상태 라벨 — 원시 코드를 운영자 문구로 (수정 계획 2장 「상태 라벨」).
 * 화면은 이 파일을 부수효과로 import 한 뒤 `<AdminStatusLabel namespace="ads.…" />` 또는
 * `adminStatusLabelText("ads.…", code, ko)` 로만 표시한다. 클라이언트 안전.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 광고 도메인 (이력 원장·피드 상품) */
registerAdminStatusLabels("ads.domain", {
  all: { ...catalogPair("admin_all"), tone: "neutral" },
  community: { ...catalogPair("admin_community"), tone: "neutral" },
  trade: { ...catalogPair("admin_trade"), tone: "neutral" },
  delivery: { ...catalogPair("admin_delivery"), tone: "neutral" },
  popup: { ...catalogPair("admin_ad_kind_popup_campaign"), tone: "neutral" },
});

/** 피드 배너 상품 영역 */
registerAdminStatusLabels("ads.feedDomain", {
  trade: { ...catalogPair("admin_trade_feed"), tone: "neutral" },
  community: { ...catalogPair("admin_report_filter_target_community"), tone: "neutral" },
});

/** 이력 증거 종류 (AdsHistoryEvidenceKind) */
registerAdminStatusLabels("ads.historyEvidence", {
  event: { ...catalogPair("admin_recorded"), tone: "success" },
  state_only: { ...catalogPair("admin_state_only"), tone: "info" },
  schedule_only: { ...catalogPair("admin_schedule_only"), tone: "info" },
  not_proven: { ...catalogPair("admin_not_proven"), tone: "warning" },
  gap: { ...catalogPair("admin_no_record"), tone: "warning" },
});
