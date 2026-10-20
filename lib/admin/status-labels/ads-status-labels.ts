/**
 * 광고(ads) 워크스페이스 Admin 상태 라벨 — 원시 코드를 운영자 문구로 (수정 계획 2장 「상태 라벨」).
 * 화면은 이 파일을 부수효과로 import 한 뒤 `<AdminStatusLabel namespace="ads.…" />` 또는
 * `adminStatusLabelText("ads.…", code, ko)` 로만 표시한다. 클라이언트 안전.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 광고 도메인 (이력 원장·피드 상품) */
registerAdminStatusLabels("ads.domain", {
  all: { ko: "전체", en: "All", tone: "neutral" },
  community: { ko: "커뮤니티", en: "Community", tone: "neutral" },
  trade: { ko: "거래", en: "Trade", tone: "neutral" },
  delivery: { ko: "배달", en: "Delivery", tone: "neutral" },
  popup: { ko: "팝업", en: "Popup", tone: "neutral" },
});

/** 피드 배너 상품 영역 */
registerAdminStatusLabels("ads.feedDomain", {
  trade: { ko: "거래 피드", en: "Trade feed", tone: "neutral" },
  community: { ko: "커뮤니티 피드", en: "Community feed", tone: "neutral" },
});

/** 이력 증거 종류 (AdsHistoryEvidenceKind) */
registerAdminStatusLabels("ads.historyEvidence", {
  event: { ko: "기록 있음", en: "Recorded", tone: "success" },
  state_only: { ko: "상태만 있음", en: "State only", tone: "info" },
  schedule_only: { ko: "일정만 있음", en: "Schedule only", tone: "info" },
  not_proven: { ko: "확인 불가", en: "Not proven", tone: "warning" },
  gap: { ko: "기록 없음", en: "No record", tone: "warning" },
});
