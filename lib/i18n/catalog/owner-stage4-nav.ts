/**
 * 4단계 4-1·4-7 — 오너 12그룹 IA 레지스트리 그룹 제목·신규 제목 키 (문서 G §4-2).
 * Separate top-level catalog — `adminMessages` / `businessMessages` 는 TS 직렬화 한도(TS7056) 근처.
 * 라벨 = 제목 단일 키: 드로어 라벨·헤더 제목이 같은 키를 쓴다.
 */

export const ownerStage4NavMessages = {
  ko: {
    owner_s4_group_home: "운영 홈",
    owner_s4_group_orders: "주문",
    owner_s4_group_products: "메뉴·상품",
    owner_s4_group_store: "매장 설정",
    owner_s4_group_settlement: "돈 관리",
    owner_s4_group_ads: "마케팅",
    owner_s4_group_customers: "고객",
    owner_s4_group_notifications: "알림",
    owner_s4_group_support: "지원",
    owner_s4_title_store_manage: "매장 관리",
    owner_s4_title_ops_status: "운영 상태",
    owner_s4_title_public_preview: "공개 매장 미리보기",
    owner_s4_title_delivery: "영업·배달 설정",
    owner_s4_title_settlements: "수수료·캐시 원장",
    owner_s4_desc_settlements: "수수료 부과·캐시 차감·미납 원장",
    owner_s4_title_ads_event: "이벤트 프로모션",
    owner_s4_title_notif_settings: "내 계정 알림 설정",
    owner_s4_title_cs_center: "플랫폼 고객센터",
    owner_s4_title_apply: "입점 신청",
    owner_s4_sidebar_label: "매장 운영 메뉴",
  },
  en: {
    owner_s4_group_home: "Dashboard",
    owner_s4_group_orders: "Orders",
    owner_s4_group_products: "Menu & products",
    owner_s4_group_store: "Store settings",
    owner_s4_group_settlement: "Money",
    owner_s4_group_ads: "Marketing",
    owner_s4_group_customers: "Customers",
    owner_s4_group_notifications: "Notifications",
    owner_s4_group_support: "Support",
    owner_s4_title_store_manage: "Store management",
    owner_s4_title_ops_status: "Operations status",
    owner_s4_title_public_preview: "Public store preview",
    owner_s4_title_delivery: "Hours & delivery settings",
    owner_s4_title_settlements: "Commission & cash ledger",
    owner_s4_desc_settlements: "Commission charges, Cash deductions & unpaid ledger",
    owner_s4_title_ads_event: "Event promotions",
    owner_s4_title_notif_settings: "My account notification settings",
    owner_s4_title_cs_center: "Platform customer center",
    owner_s4_title_apply: "Store application",
    owner_s4_sidebar_label: "Store operations menu",
  },
} as const;
