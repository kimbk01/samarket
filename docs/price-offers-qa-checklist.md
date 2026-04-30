# 가격 제안 재구성 QA (스모크)

1. **구매자 상세 CTA**  
   `is_price_offer` 상품에서 로그인 구매자: 제안 없음·대기·거절·만료 시 하단 **거래 채팅 버튼 없음** / 프리페치·선로딩 미동작. **수락 후**에만 채팅 CTA·프리페치 허용. 일반 거래 글(`is_price_offer` 아님)은 기존처럼 채팅만.

2. **제안 생성·채팅 분리**  
   `POST /api/offers` 만으로는 거래 채팅방이 만들어지지 않음 (grep: `ensureTradeChatRoomForOffer`는 accept 경로만).

3. **내 제안·히스토리**  
   `GET /api/offers/mine?productId=` 에 여러 건(최신순) 표시, 상세 카드에서 이전 제안 접기/펼치기. 거절·만료 후 **다시 제안하기**로 모달 재오픈.

4. **판매자 목록 API**  
   `OfferListSeller` → `GET /api/offers/received?productId=` 만 사용 (`/api/posts/.../price-offers` 없음).

5. **알림**  
   판매자: 신규 제안 (`offer_created`), 구매자: 수락/거절 문구 및 금액 표시; 매핑은 `docs/price-offers-notifications-mapping.md` 참고.

6. **Realtime 동기화**  
   DB에 `20260630140000_price_offers_realtime_publication.sql` 적용 후, 서로 다른 기기·탭에서도 같은 상품 상세를 열어두면 `price_offers` 변경 시 목록·구매자 상태가 **재요청**으로 맞춰지는지 확인 (RLS로 볼 수 있는 행만 이벤트 수신).
