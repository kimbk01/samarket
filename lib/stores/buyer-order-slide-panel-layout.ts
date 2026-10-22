/**
 * 구매자 `/orders` 슬라이드 패널(리뷰 작성·주문 채팅) 전용 레이어 — S2-05.
 *
 * 오너 `owner-order-chat-slide-layout.ts` 의 z-[80]/z-[81] 은 오너 화면(하단 탭 없음) 기준이라
 * 구매자 허브(하단 탭 z-1200 표시)에서는 패널 하단(리뷰 제출·채팅 입력)이 탭 아래에 깔린다.
 * 소비자 패널은 다른 배달 전체 화면 오버레이와 같은 오버레이 SSOT 시트 레이어를 쓴다 (새 숫자 체계 없음).
 * 슬라이드 시간·이징·폭은 오너와 같은 값을 그대로 재사용한다.
 */
import { OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";

/** 백드롭+패널 컨테이너 — 하단 탭(z-1200) 위, 중첩 확인창(nested z-1305) 아래 */
export const BUYER_ORDER_SLIDE_OVERLAY_Z_CLASS = OVERLAY_Z_CLASS.sheet;
