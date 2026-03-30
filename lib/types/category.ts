/**
 * 카테고리 시스템 타입 (re-export from lib/categories/types)
 * - categories: type, sort_order, is_active 확장
 * - category_settings: can_write, has_price, has_chat, has_location, post_type
 */
export type {
  CategoryType,
  QuickCreateGroup,
  CategoryRow,
  CategorySettingsRow,
  CategoryWithSettings,
  CategoryUpdatePayload,
  CategorySettingsUpdatePayload,
} from "@/lib/categories/types";

export const CATEGORY_TYPE_LABELS: Record<import("@/lib/categories/types").CategoryType, string> = {
  trade: "거래",
  service: "서비스",
  community: "커뮤니티",
  feature: "기능",
};

/** 메뉴 관리용: 타입은 거래/커뮤니티만 — 한 화면에서 ‘메인 글 유형’ 선택 */
export const MENU_TYPE_OPTIONS = [
  { value: "trade" as const, label: "거래 (홈 상단 칩·가격·거래채팅)" },
  { value: "community" as const, label: "동네생활·게시글 (게시판형)" },
];

/** 거래 선택 시 종류 (선택된 항목이 메뉴로 노출됨). 직거래·나눔은 거래 방식(쓰기에서 선택)이라 여기 없음 */
export const TRADE_SUBTYPE_OPTIONS = [
  { value: "general", label: "일반" },
  { value: "used-car", label: "중고차" },
  { value: "real-estate", label: "부동산" },
  { value: "jobs", label: "알바" },
  { value: "exchange", label: "환전" },
  { value: "__custom__", label: "추가 (직접 입력)" },
];

export const TRADE_SUBTYPE_PRESET_VALUES = ["general", "used-car", "real-estate", "jobs", "exchange"];

/** 거래 종류별 스킨 라벨 (리스트/상세 뱃지 등) */
export const TRADE_SKIN_LABELS: Record<string, string> = {
  general: "일반",
  "used-car": "중고차",
  "real-estate": "부동산",
  jobs: "알바",
  exchange: "환전",
};

/** 커뮤니티 선택 시 게시판 스킨 */
export const COMMUNITY_SKIN_OPTIONS = [
  { value: "basic", label: "베이직" },
  { value: "gallery", label: "갤러리" },
  { value: "magazine", label: "매거진" },
];

export const POST_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "normal", label: "일반" },
  { value: "community", label: "커뮤니티" },
  { value: "job", label: "알바" },
  { value: "real_estate", label: "부동산" },
  { value: "car", label: "중고차" },
  { value: "store", label: "스토어" },
  { value: "service_request", label: "서비스 요청" },
  { value: "feature", label: "기능" },
  { value: "post", label: "일반 글" },
  { value: "request", label: "요청형" },
  { value: "link", label: "페이지 이동" },
];

/** 타입 선택 시 폼에 자동 반영할 기능 기본값 (관리자가 수정 가능) */
export const CATEGORY_TYPE_DEFAULT_SETTINGS: Record<
  import("@/lib/categories/types").CategoryType,
  { can_write: boolean; has_price: boolean; has_chat: boolean; has_location: boolean; post_type: string }
> = {
  trade: { can_write: true, has_price: true, has_chat: true, has_location: true, post_type: "normal" },
  community: { can_write: true, has_price: false, has_chat: false, has_location: true, post_type: "community" },
  service: { can_write: true, has_price: false, has_chat: true, has_location: true, post_type: "service_request" },
  feature: { can_write: false, has_price: false, has_chat: false, has_location: false, post_type: "feature" },
};
