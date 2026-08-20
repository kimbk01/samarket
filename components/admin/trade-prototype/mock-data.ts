/**
 * UI prototype fixtures only — not live API data.
 * KPI totals marked disconnected unless noted from audit screenshot context.
 */

import { TRADE_PROTOTYPE_BASE } from "./trade-prototype-nav";

export type MockListingRow = {
  id: string;
  shortId: string;
  title: string;
  sellerName: string;
  sellerHandle: string;
  subject: string;
  categoryPath: string;
  price: string;
  region: string;
  status: "active" | "sold" | "hidden" | "deleted";
  visibility: "public" | "hidden";
  likes: number | null;
  chats: number | null;
  reports: number | null;
  promoted: boolean;
  registeredAt: string;
  thumbnail?: string;
};

export type MockReportSummary = {
  postId: string;
  title: string;
  seller: string;
  count: number;
  latestReason: string;
};

export type MockTradeRow = {
  postTitle: string;
  seller: string;
  buyer: string;
  flow: string;
  statusLabel: string;
};

export type MockOpsQueue = {
  label: string;
  count: number | null;
  href: string;
  disconnected?: boolean;
};

/** Audit screenshot: posts-management showed 194 total in DB filter summary */
export const MOCK_TOTAL_LISTINGS = 194;

export const MOCK_LISTINGS: MockListingRow[] = [
  {
    id: "7753c59c-a1b2-4c3d-9e0f-111122223333",
    shortId: "7753c59c…",
    title: "Toyota Vios",
    sellerName: "CCM",
    sellerHandle: "asas55",
    subject: "중고차",
    categoryPath: "Toyota › Vios",
    price: "₱35,000",
    region: "Manila M2",
    status: "active",
    visibility: "public",
    likes: 0,
    chats: 0,
    reports: 0,
    promoted: true,
    registeredAt: "2026. 8. 18.",
  },
  {
    id: "0d9debc9-bbbb-cccc-dddd-eeeeffff0000",
    shortId: "0d9debc9…",
    title: "Selling pesos",
    sellerName: "CCM",
    sellerHandle: "asas55",
    subject: "환전",
    categoryPath: "환전거래",
    price: "₱2,500",
    region: "Quezon Q30",
    status: "hidden",
    visibility: "hidden",
    likes: 0,
    chats: 0,
    reports: 0,
    promoted: false,
    registeredAt: "2026. 8. 18.",
  },
  {
    id: "aaa-bbbb-cccc-dddd-111122223333",
    shortId: "aaa-bbbb…",
    title: "Mart",
    sellerName: "CCM",
    sellerHandle: "asas55",
    subject: "알바",
    categoryPath: "일자리",
    price: "₱600",
    region: "Metro Manila",
    status: "active",
    visibility: "public",
    likes: 1,
    chats: 5,
    reports: 0,
    promoted: false,
    registeredAt: "2026. 8. 18.",
  },
  {
    id: "bbb-cccc-dddd-eeee-111122223333",
    shortId: "bbb-cccc…",
    title: "Flight Attendant",
    sellerName: "CCM",
    sellerHandle: "asas55",
    subject: "알바",
    categoryPath: "일자리",
    price: "₱75,000",
    region: "Manila",
    status: "active",
    visibility: "public",
    likes: 0,
    chats: 4,
    reports: 0,
    promoted: false,
    registeredAt: "2026. 8. 18.",
  },
];

export const MOCK_REPORT_SUMMARIES: MockReportSummary[] = [
  {
    postId: MOCK_LISTINGS[0]!.id,
    title: "Toyota Vios",
    seller: "CCM",
    count: 3,
    latestReason: "허위 상품",
  },
  {
    postId: "sample-iphone",
    title: "iPhone 15",
    seller: "ABC",
    count: 2,
    latestReason: "부적절한 콘텐츠",
  },
];

export const MOCK_RECENT_TRADES: MockTradeRow[] = [
  {
    postTitle: "Toyota Vios",
    seller: "CCM",
    buyer: "user22",
    flow: "negotiating",
    statusLabel: "진행중",
  },
  {
    postTitle: "Samsung S24",
    seller: "abc",
    buyer: "user54",
    flow: "buyer_confirmed",
    statusLabel: "완료",
  },
];

export const MOCK_OPS_QUEUES: MockOpsQueue[] = [
  { label: "신고 검토", count: 8, href: "/admin/reports" },
  { label: "판매완료 확인", count: 3, href: `${TRADE_PROTOTYPE_BASE}/operations?tab=confirm` },
  { label: "광고 승인 대기", count: null, href: "/admin/ad-applications", disconnected: true },
  { label: "숨김 게시물", count: null, href: `${TRADE_PROTOTYPE_BASE}/listings?status=hidden`, disconnected: true },
  { label: "최근 이상 활동", count: null, href: "#", disconnected: true },
];

export const MOCK_AD_SUMMARY = [
  { label: "승인 대기", value: null as number | null, disconnected: true },
  { label: "활성 홍보", value: null, disconnected: true },
  { label: "오늘 만료", value: null, disconnected: true },
  { label: "거래 광고", value: null, disconnected: true },
] as const;

export const MOCK_KPI = [
  { label: "전체 게시물", value: MOCK_TOTAL_LISTINGS, disconnected: false },
  { label: "판매중", value: null, disconnected: true },
  { label: "판매완료", value: null, disconnected: true },
  { label: "숨김", value: null, disconnected: true },
  { label: "신고 대기", value: null, disconnected: true },
  { label: "진행 거래", value: null, disconnected: true },
  { label: "오늘 등록", value: null, disconnected: true },
  { label: "홍보중", value: null, disconnected: true },
] as const;

export function getMockListing(id: string): MockListingRow | undefined {
  return MOCK_LISTINGS.find((r) => r.id === id) ?? MOCK_LISTINGS[0];
}
