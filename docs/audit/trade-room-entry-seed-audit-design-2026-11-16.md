# 거래방 진입 데이터 감사·수정 설계 (2026-11-16)

- 계기: CREW REP 실기 F1(휴대폰에서 거래방 「거래 행동 줄」—거래 평가 줄·판매 상태 줄—이 안 나옴). 계획 문서 `crew-rep-device-verify-fix-plan-2026-11-16.md` 단계 A·C 를 이 문서로 대체한다.
- **작업자 정정(먼저 적음)**: 직전 보고의 「silent_delta 결과 미반영 원인 확인 못 함」과 C2(시드에 productChatId 없으면 한 번 더 받기)는 전체를 보지 않은 땜빵안이었다. 아래 감사로 원인이 모두 확정되어 폐기한다. 그 silent_delta 요청은 방 데이터를 고치는 요청이 아니라 상대 읽음 위치만 받는 요청이다(D7).
- 확인 조건: Production 웹(11-16 오전), Samsung SM-M156S 디버그 빌드 1.2.7/62(측정 후 운영 APK 로 복구), q테스트1(판매자) 로그인, 폭 384. 방 `33a8f97f`「팝니다 · Toyota Vios」. 운영 DB 는 읽기만.
- 측정 원본: `docs/audit/crew-rep-f1-measure-2026-11-16/`.

## 1. 결함 목록

| # | 결함 | 판정 | 증거 |
|---|---|---|---|
| D1 | 거래 채팅 목록 → 방 진입 시 거래 행동 줄(평가·판매 상태) 전체가 안 나옴, 거래 상세 조회도 안 함(⋮ 메뉴 가격 ₱0·상대 정보 공백의 원인) | **FAIL (기기 측정)** | 방 상태 contextMeta 에 `productChatId` 없음 14초 유지(`f1-fiber-list.json`), 평가·거래 상세 요청 0 |
| D2 | 목록 행을 누르는 순간 캐시에 있던 서버 방 데이터가 목록 값으로 덮이고 「방금 받은 최신」으로 표시됨 → 이후 서버 갱신이 모두 건너뛰어져 틀린 값이 방에 남고, hot·IndexedDB 에 저장되어 다음 진입(알림·푸시 포함)에도 남음 | **FAIL (코드 확정 + 기기 측정)** | 측정: 목록 탐색 중 `list_prefetch` 로 서버 스냅샷(정상)을 받았는데 방 상태는 목록 값. 코드: 아래 §2 |
| D3 | 목록 시드의 방 키 `messengerDirectKey` 가 `trade_item:<글 id>` — 서버 원장은 `trade_item:<chat_rooms.id>` | **FAIL (DB 확인)** | 방 33a8f97f `direct_key=trade_item:0fc71fc7…`(= chat_rooms.id), 시드는 `trade_item:227dcf5b…`(= posts.id) |
| D4 | 목록 시드의 역할 표기 `roleLabel` 이 「판매」「구매」 → 역할 판정 함수는 「판매자」「구매자」만 인식 → 방 역할 색(`data-trade-viewer-role`) 없음 | **FAIL (기기 측정)** | 목록 경유 진입 `data-trade-viewer-role` = 없음 |
| D5 | 서버가 거래방 역할을 **보는 사람과 무관하게** 저장된 값 그대로 내려줌. 저장값은 거래방 440개 중 435개가 「구매자」(판매자 0) → 판매자 화면에서도 「구매자」 색·역할 | **FAIL (기기 측정 + DB)** | 판매자 q테스트1 직접 진입 `data-trade-viewer-role="buyer"`. `service.ts:2752` `buildRoomSummaryFromHydratedMembers` 가 `summary` 를 그대로 파싱 |
| D6 | 목록 요약 + 실시간 메시지 1건으로 만든 시드(멤버 0명)를 「완전한 방 데이터」로 인정 → 서버 조회 없이 방이 열림 | **코드 확정 · 기기 NOT_PROVEN** | `messenger-room-timeline-hydration.ts:51-63` 메시지 1건이면 complete, 멤버·contextMeta 는 보지 않음 |
| D7 | (결함 아님·설계 확인) 진입 때 보이는 `silent_delta&cmReqSrc=room_silent` 1회 요청은 D-12 상대 읽음 위치 전용 — `readReceipt` 만 쓰고 방 데이터는 안 고침 | 정상 동작 | `use-messenger-room-client-phase1.ts:1398-1430` |

- 역할(판매자·구매자)과 화면 폭은 원인이 아니다. **진입 경로**가 원인이다.
- Xiaomi 분할 화면에서 줄이 나온 이유: 코드상 캐시가 비어 서버 조회(cold 경로)로 들어간 경우로 보이나 **측정 안 함(NOT_PROVEN)** — 그 설치본(61)은 디버거가 없다.

## 2. 원인 사슬 (코드, 파일:줄)

1. 거래 목록 행 → 방 요약: `domain-trade-list-row-to-unified-item.ts:27-38, 63` — contextMeta 에 productChatId 없음, roleLabel 「판매/구매」, 방 키 `trade_item:${itemId}`(글 id). 목록 DTO(`DomainTradeListCanaryGate.tsx:71-91`)와 조합(`domain-read-trade-list-compose.ts:158-176`)에 productChatId·방 키가 없다. 원천 로더(`phase11b-live-domain-loaders.ts:700-713`)와 `lib/messenger/trade/list.ts:87` 은 productChatId 를 갖고 있는데, 행 모델(`row-model.ts`)·DTO 에서 빠진다.
2. 누름(pointerdown)·이동: `MessengerChatListItem.tsx:581-597` `armMessengerRoomRoutePrefetch(roomForPrime)` → `arm-messenger-room-route-prefetch.ts:50` / `community-messenger-room-forward-navigation.ts:164` `primeMessengerRoomEntrySnapshot` → `messenger-realtime-store.ts:717-729` → `room-snapshot-cache.ts:316-343` `seedRoomSnapshotFromSummary`: 기존 서버 스냅샷이 있으면 `room: { ...기존.room, ...목록요약 }` 으로 **contextMeta·방 키를 목록 값으로 덮고**, `primeRoomSnapshot`(`at = now`)·`primeHotRoomSnapshot`(TTL 없음)에 저장.
3. 「최신」으로 표시된 틀린 캐시 때문에:
   - 목록 prefetch: `prefetch_skip_unchanged_since_list`(room-snapshot-cache.ts:538) — 요청 없음
   - 방 Gate: 캐시를 그대로 마운트(`CommunityMessengerRoomBootstrapGate.tsx:116-118, 304-309`), 백그라운드 조회도 60초 안 캐시 반환(`fetch-community-messenger-room-bootstrap-client.ts:63-75`)
   - 진입 생명주기: 시드 complete → 포그라운드 조회 안 함, 목록 시드엔 `membersDeferred`·`bootstrapEnrichmentPending` 이 없어 추가 조회도 없음(`use-messenger-room-bootstrap-lifecycle.ts:69-79`)
   - silent 갱신: 캐시 5초 안이면 `local_snapshot_sufficient` 로 건너뜀·재시도 없음(`messenger-room-bootstrap-refresh.ts:722-744`). phase1 이 상태가 바뀔 때마다 캐시를 다시 저장해 `at` 이 계속 갱신됨(`messenger-realtime-store.ts:396-397`)
   - 진입 확인 요청(D7)은 읽음 위치만 반영
   → **방 데이터를 서버 값으로 고치는 경로가 하나도 남지 않는다.**
4. 거래 행동 줄: `use-messenger-room-phase2-room-presentation.ts:87-93` productChatId 없음 → `CommunityMessengerRoomPhase2TradeActionStrip.tsx:19` null. 거래 상세 GET 도 `use-messenger-room-client-phase1.ts:1064-1071` 에서 productChatId 가 없어 건너뜀(⋮ 메뉴 ₱0).
5. 서버 역할(D5): 방 `summary` 는 방 생성 때 한쪽 시점으로 1회 저장(`roleLabel` 고정). 방 부트스트랩 `service.ts:2752`·silent delta `load-community-messenger-room-silent-delta.ts:108-109, 134, 177-178` 가 그대로 파싱. 목록용 경로(`service.ts:7046`·`7609`·`9126` 등)는 보는 사람 기준으로 다시 만들지만 방 경로는 안 한다.

## 3. 영향 범위 (진입 경로 전수 — 19개)

| 진입 | 목록 요약으로 캐시 덮음(D2) | 비고 |
|---|---|---|
| 거래 채팅 목록 행 탭·길게 눌러 입장·분할 화면 왼쪽 목록 | 예 (거래 목록 시드 = D1·D3·D4 값) | 이번 F1 |
| 메신저 홈 목록 행 | 예 (홈 목록 요약 — 서버가 보는 사람 기준으로 만든 값이라 D1·D3·D4 없음) | D2 구조는 같음 |
| 전역 검색 결과 | 예 (검색 hit 요약) | |
| 상품 상세 「채팅하기」·찜·레거시 URL·알림 배너·알림함·OS 푸시·통화 기록·딥링크 | 아니요 | 단 **hot·IndexedDB 에 남은 틀린 방 데이터가 첫 화면**이 될 수 있음(D2) |
| 주소 직접 열기(캐시 없음) | 아니요 | 서버 조회 → 정상(측정 PASS). 단 D5(역할 반대) |

화면 영향: 거래 행동 줄(판매 상태 변경·거래 평가), ⋮ 메뉴 상품 가격·상대 정보, 방 역할 색, 거래 목록 행 역할 색(`MessengerChatListItem.tsx:379`, `trade-chat-list-resolve.ts:40` 이 roleLabel 을 먼저 믿음 — D4·D5).

## 4. 수정 설계 (원인별)

### PR 1 — 메신저 클라이언트·목록 DTO (D1·D2·D3·D4·D6)
| # | 원인 | 바꾸는 것 | 파일 |
|---|---|---|---|
| S1 | D1·D3·D4 목록 시드가 서버와 다른 값 | 목록 행 모델·DTO 에 원천 로더가 이미 가진 `productChatId`·서버 방 키(`directKey`)를 실어 보내고, 시드는 그 값을 그대로 쓴다. 역할 표기는 서버와 같은 「판매자/구매자」(같은 상수 1곳). 서버 값이 없으면 방 키·productChatId 를 **만들어 넣지 않는다**(지금처럼 글 id 로 지어내지 않음) | `lib/messenger/trade/row-model.ts`, `domain-read-trade-list-compose.ts`, `DomainTradeListCanaryGate.tsx`(DTO 타입·검증), `domain-trade-list-row-to-unified-item.ts` |
| S2 | D2 목록 요약이 서버 스냅샷을 덮고 신선도를 갱신 | `seedRoomSnapshotFromSummary` 를 「서버 스냅샷이 있으면 목록에서만 아는 값(안 읽은 수·마지막 메시지·시각)만 반영, 방 정체성·메타(contextMeta·summary·messengerDirectKey·roomType·peerUserId·chatDomain·domainIdentity)는 서버 값 유지, 신선도 `at` 은 갱신 안 함」으로 바꾼다. 실시간 수신 경로(store `:533-546`)도 같은 함수라 함께 바뀐다 | `lib/community-messenger/room-snapshot-cache.ts` |
| S3 | D6 목록 요약만으로 만든 스냅샷이 완전한 방 데이터로 인정 | 서버 스냅샷이 없어 목록 요약으로 새로 만든 스냅샷에 「목록 시드」 표시를 달고, 방은 그대로 먼저 그리되(체감 속도 유지) 진입 시 **건너뛸 수 없는 서버 조회 1회**로 방 데이터를 교체한다(`local_snapshot_sufficient`·fingerprint 같음 판정에서 제외). 서버 응답이 오면 표시를 지운다 | `room-snapshot-cache.ts`, `messenger-room-initial-snapshot-authority.ts`, `use-messenger-room-bootstrap-lifecycle.ts`, `messenger-room-bootstrap-refresh.ts`, `types.ts` |

- 깨질 수 있는 것과 처리:
  - S2 이후 목록 행에서 바뀐 제목·사진이 방에 즉시 안 보일 수 있음 → 1:1 제목·사진은 지금도 silent merge 가 안 바꾸는 값이라 동작 변화 없음(코드 확인). 안 읽은 수·마지막 메시지는 계속 반영.
  - S3 은 목록 시드 진입마다 요청 1회 추가(캐시에 서버 스냅샷이 있으면 추가 없음) → 메신저 방 진입은 hot-path 이므로 `verify:parity-gates` 와 진입 시간(`messenger_room_entry`) 전후 측정을 같은 PR 에서 한다.
  - `/market`·`getPostsForHome` 은 건드리지 않음. 통화 코드 무관. 방 뷰포트 계약(`community-messenger-mobile-room-viewport.md`) 영역 아님(데이터 경로만).
  - 이미 기기 hot·IndexedDB 에 남은 틀린 방 데이터: S3 의 서버 조회 1회가 진입 때 교체한다(지난 데이터 일괄 정리 없음).

### PR 2 — 서버 방 역할 (D5)
| # | 바꾸는 것 | 파일 |
|---|---|---|
| S4 | 방 부트스트랩·silent delta 에서 거래방 contextMeta 의 `roleLabel` 을 저장값 대신 **보는 사람 기준**으로 만든다(판매자 id 는 `product_chats.seller_id`, contextMeta.productChatId 로 PK 1건 조회를 기존 병렬 조회에 합침). 저장된 `summary` 는 바꾸지 않는다(운영 데이터 변경 없음) | `lib/community-messenger/service.ts`(`buildRoomSummaryFromHydratedMembers` 호출부), `lib/community-messenger/server/load-community-messenger-room-silent-delta.ts` |

- 방 부트스트랩 API 응답 시간에 PK 조회 1건이 붙는다 → 서버 hot-path, PR 에서 응답 시간 전후 측정. 1:1 거래방만 해당.
- PR 1 과 원인이 달라 분리한다(같은 PR 로 묶지 않음).

## 5. 검증
- 코드: 원인별 단위 시험 — S1 시드 값(productChatId·방 키·역할), S2 서버 스냅샷 위 목록 시드가 메타·신선도를 안 바꿈, S3 목록 시드 진입 시 서버 조회가 건너뛰어지지 않음, S4 판매자·구매자 각자 역할.
- 기기(배포 후, Production SHA 기록): Samsung 휴대폰 판매자·구매자 × 진입 경로(거래 목록·메신저 홈·상품 상세·알림·주소 직접) — 거래 행동 줄·평가 줄·역할 색·⋮ 메뉴 가격. Xiaomi 분할 화면 거래 목록. 상태 판정은 측정과 같은 방법(방 상태·요청 기록).

## 6. 보고만 (범위 밖)
- `use-messenger-room-client-phase1.ts:354` 주석은 hot 캐시 제외라 하지만 실제(`messenger-room-initial-snapshot-authority.ts:151-154`)는 포함 — 주석·코드 불일치.
- 포그라운드 재사용 일부 사유(`foreground_inflight` 등, `cm-room-bootstrap-lock.ts:307-347`)는 완전성 검사 없이 재사용 — 이번 원인과 직접 관련 없음, 측정 안 함.

## 7. NOT_PROVEN
D6 기기 재현 · Xiaomi 분할 화면 정상 이유 · 알림·푸시·상품 상세 진입에서 hot/IndexedDB 의 틀린 데이터가 실제로 보이는지 · 목록 행 역할 색 화면 · iPhone 전부.
