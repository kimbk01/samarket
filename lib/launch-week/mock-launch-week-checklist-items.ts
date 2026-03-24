/**
 * 49단계: 첫 주 안정화 체크리스트 mock (38 checklist 연계)
 */

import type {
  LaunchWeekChecklistItem,
  LaunchWeekDayNumber,
  LaunchWeekChecklistStatus,
} from "@/lib/types/launch-week";

const now = new Date().toISOString();

const ITEMS: LaunchWeekChecklistItem[] = [
  {
    id: "lwci-1",
    dayNumber: 1,
    area: "auth",
    title: "회원가입 오류 모니터링",
    description: "Must watch: 가입 실패율·에러 로그",
    status: "done",
    priority: "critical",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    blockerReason: null,
    note: "",
    checkedAt: now,
    updatedAt: now,
  },
  {
    id: "lwci-2",
    dayNumber: 1,
    area: "product",
    title: "상품등록 실패 모니터링",
    description: "Must watch: 등록 실패 건수",
    status: "done",
    priority: "critical",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    checkedAt: now,
    updatedAt: now,
  },
  {
    id: "lwci-3",
    dayNumber: 1,
    area: "image_upload",
    title: "이미지 업로드 실패 모니터링",
    description: "Must watch: 스토리지·업로드 에러",
    status: "in_progress",
    priority: "high",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "일부 500 확인 중",
    checkedAt: null,
    updatedAt: now,
  },
  {
    id: "lwci-4",
    dayNumber: 2,
    area: "chat",
    title: "채팅 생성 실패 모니터링",
    description: "Must watch: 채팅방 생성·메시지 전송",
    status: "blocked",
    priority: "critical",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: "채팅 API 지연 이슈",
    note: "",
    checkedAt: null,
    updatedAt: now,
  },
  {
    id: "lwci-5",
    dayNumber: 2,
    area: "recommendation",
    title: "추천 피드 비정상 모니터링",
    description: "Must watch: 빈 피드·fallback 발생",
    status: "done",
    priority: "high",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    checkedAt: now,
    updatedAt: now,
  },
  {
    id: "lwci-6",
    dayNumber: 3,
    area: "moderation",
    title: "신고 급증 모니터링",
    description: "Must watch: 신고 건수·처리 지연",
    status: "todo",
    priority: "high",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    checkedAt: null,
    updatedAt: now,
  },
  {
    id: "lwci-7",
    dayNumber: 4,
    area: "point_payment",
    title: "포인트/광고 신청 누락 모니터링",
    description: "Must watch: 결제·신청 실패",
    status: "todo",
    priority: "medium",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    checkedAt: null,
    updatedAt: now,
  },
  {
    id: "lwci-8",
    dayNumber: 5,
    area: "admin_ops",
    title: "Daily check / shift handoff placeholder",
    description: "일일 점검·인수인계 메모",
    status: "todo",
    priority: "medium",
    ownerAdminId: null,
    ownerAdminNickname: null,
    blockerReason: null,
    note: "",
    checkedAt: null,
    updatedAt: now,
  },
];

export function getLaunchWeekChecklistItems(filters?: {
  dayNumber?: LaunchWeekDayNumber;
  status?: LaunchWeekChecklistStatus;
  area?: string;
}): LaunchWeekChecklistItem[] {
  let list = [...ITEMS];
  if (filters?.dayNumber)
    list = list.filter((c) => c.dayNumber === filters.dayNumber);
  if (filters?.status)
    list = list.filter((c) => c.status === filters.status);
  if (filters?.area)
    list = list.filter((c) => c.area === filters.area);
  return list.sort((a, b) => a.dayNumber - b.dayNumber || a.id.localeCompare(b.id));
}

export function getBlockedChecklistItems(): LaunchWeekChecklistItem[] {
  return ITEMS.filter((c) => c.status === "blocked" && c.blockerReason);
}
