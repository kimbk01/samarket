# CREW REP 실기 결함 수정 계획 (2026-11-16)

- 근거 실기: 11-16 09:08~09:25 PHT · Production `986f58f`(S1~S6) · Samsung SM-M156S 휴대폰(q테스트1, 앱 1.2.7/62) · Xiaomi 태블릿 가로 분할 화면(zxzx11, 1.2.7/61). Owner 계정·폰 아님.
- 실기 중 작업자 조작: 시험 계정 zxzx11 → q테스트1 QA 거래방 「팝니다 · Toyota Vios」에 시험 메시지 2건·거래 평가 1건(좋아요·응답 빨랐어요·pending_reveal, 11-23 자동 공개 예정), Xiaomi·Samsung 앱 각 1회 재시작. Xiaomi 「프로필 수정」 창이 잘못 열렸다 저장 없이 닫힘.
- 설계 근거: `docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md` §4.6·§4.7·§7.3

## 1. 결함과 원인

| # | 결함 | 판정 | 원인 |
|---|---|---|---|
| F1 | **휴대폰 화면에서 거래방 「거래 행동 줄」 전체가 안 나옴** — 거래 평가 줄 + 판매자 판매 상태 줄 둘 다 | FAIL | **미확정 (좁힌 범위는 아래)** |
| F2 | 거래방 ⋮ 메뉴에 상대 CREW REP 이 안 나옴 (q테스트1 55점인데 없음) | FAIL | 확정: 메뉴는 방 스냅샷의 거래 상세(`tradeChatRoomDetail.partnerTrustScore`)에서만 점수를 읽는데, 이 방 스냅샷엔 거래 상세가 없음(메뉴 가격도 ₱0). 점수를 모르면 숨기도록 S1 에서 바꿔 사라짐(전에는 가짜 36.5°C) |
| F3 | 내 CREW REP 90일 그래프가 85→55 하락 없이 55 평평 | FAIL | 확정: `ScoreChart` 가 90일 안 첫 이력의 「바뀐 뒤 점수」만 쓰고 「바뀌기 전 점수」(score_before)를 시작점으로 쓰지 않음 — 작업자(S6) 결함 |

### F1 좁힌 범위 (측정 근거)
| 조건 | 거래 행동 줄 | Supabase 요청 기록 |
|---|---|---|
| Xiaomi 분할 화면 · 구매자 · Toyota Vios | 나옴(몇 초 뒤) · 평가 제출 성공 | 평가 API 쿼리 확인 |
| Xiaomi 분할 화면 · 판매자 · 캐딜락 | 나옴(「판매 상태 판매중 · 판매완료로 변경」) | — |
| Samsung 휴대폰 · 판매자 · Toyota Vios (앱 재시작 후 20초) | 안 나옴 | 방 열기 요청만 있고 **평가·거래 상세 요청 0** |
| Samsung 휴대폰 · 판매자 · TWO | 안 나옴 | — |

- 서버 판정은 정상: 같은 방에서 판매자·구매자 모두 「자격 있음」(판매자 4·구매자 3 메시지, 창 11-27까지).
- 데이터 차이 없음: 방 `direct_key=trade_item:…`(상거래 키), `summary.productChatId` 있음, 판매자·구매자 나감 표시 없음.
- 결론: 휴대폰 화면에서 `CommunityMessengerRoomPhase2TradeActionStrip` 이 아무것도 그리지 않고 하위 요청도 보내지 않는다. **역할·데이터 문제가 아니라 휴대폰 화면 경로**. 그 안에서 어느 조건이 빈 값인지(`showMessengerTradeProcessDock`·`tradeProductChatIdForDock`)는 기기 안 상태를 봐야 확정된다 — Samsung·Xiaomi 설치본 모두 디버거가 없는 출시 빌드라 지금은 볼 수 없다.
- 이번 CREW REP 변경 전부터 있던 결함인지: **확인 못 함** (판매자 판매 상태 줄도 같이 없어서 10-27 PR-01 이후 메신저 변경에서 생겼을 가능성이 있음).

## 2. 수정 계획

### 단계 A — F1 원인 확정 (측정, 코드 변경 없음)
- 방법: Samsung 에 디버그 빌드(WebView 디버거 켜짐)를 설치해 같은 방을 열고, 방 화면 상태(`tradeProductChatIdForDock`·`showMessengerTradeProcessDock`·`snapshot.room.contextMeta`)와 네트워크(`/api/trade/product-chat/:id/rating`)를 직접 읽는다. 절차는 기존 기록(`device-measure-methods` 메모)의 「Samsung 측정용 디버그 빌드」 그대로.
- 부담: 디버그 빌드는 서명이 달라 운영 앱을 지우고 설치 → **Samsung 의 q테스트1 로그인이 풀린다.** 측정 뒤 운영 APK 를 다시 설치하면 **Owner 가 다시 로그인**해야 한다.
- 결과에 따라 원인별 수정안을 만들고 승인을 받는다(메신저 방 화면은 `docs/community-messenger-mobile-room-viewport.md` 계약 대상).

### 단계 B — F2·F3 수정 (CREW REP 화면만, PR 1개)
| # | 바꾸는 것 | 파일 | 영향 화면 |
|---|---|---|---|
| F3 | 그래프 시작점 = 90일 안 첫 이력의 `score_before`(없으면 90일 전 마지막 점수, 그것도 없으면 첫 `score_after`). 점 계산을 순수 함수로 빼서 「85→55 이력이면 시작 85·끝 55」 고정 시험 | `components/trust/CrewRepDetailSections.tsx` (+ 순수 함수 `lib/trust/crew-rep-chart-points.ts`) | `/mypage/trust` |
| F2 | ⋮ 메뉴: 스냅샷에 점수가 없고 상대가 실제 회원이면 메뉴를 열 때 `GET /api/users/:id/crew-rep` 1회로 점수를 읽어 배지·시트 표시. 매장 프로필(배달 주문자 쪽 매장)은 지금처럼 숨김. 읽기 실패면 숨김(가짜 값 없음) | `components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx`, `CommunityMessengerRoomPhase2OneToOneDotMenu.tsx`, `components/trust/CrewRepPeerButton.tsx`(점수 없이 열 수 있게) | 1:1·거래 대화방 ⋮ 메뉴 |

- F2 는 일반 1:1 대화방에서도 상대 CREW REP 이 보이게 된다(지금은 숨김). 설계 §4.6 「상대방 표시」와 맞는 동작.
- 깨질 수 있는 것: ⋮ 메뉴 열 때 요청 1회 추가(메뉴를 열 때만, 방 진입엔 영향 없음). 통화 코드는 건드리지 않는다.
- 검증: 단위 시험(그래프 점·메뉴 점수 유무 분기), 배포 후 Samsung·Xiaomi 실기(그래프 85→55, 거래방·1:1 ⋮ 메뉴 배지·시트).

### 단계 C — F1 수정 (단계 A 결과 뒤, 메신저 PR 1개)
- 원인 확정 후 원인별 설계안 → 승인 → 구현. CREW REP 과 분리된 메신저 도메인 PR.
- 검증: Samsung 휴대폰 판매자·구매자, Xiaomi 분할 화면, 판매 상태 줄과 거래 평가 줄 모두.

## 3. 보고만 (이번 계획 범위 밖)
- 거래방 ⋮ 메뉴 물품 가격 「₱0」: F2 와 같은 원인(스냅샷에 거래 상세 없음)으로 보이나 가격 표시는 CREW REP 범위 밖.
- 구매자 거래 평가 줄이 방 진입 후 몇 초 뒤에 나타남 — 몇 초인지는 측정 안 함.
- 시험 평가 1건(zxzx11→q테스트1, pending_reveal): 그대로 두면 11-23 공개 → q테스트1 점수 반영(시험 계정). 지울지 Owner 결정.
- S7(#374) 병합 대기 — 어드민 화면 실기는 그 뒤.

## 4. NOT_PROVEN 남음
동시 공개·이의제기·어드민 이의 결정·허위 신고 판정 화면 · 어드민 정책 탭 · 03:00 예약 작업 실행 · 평가 있는 판매자의 판매자 시트 · iPhone 전부.
