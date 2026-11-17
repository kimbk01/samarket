# S2·S4 병합 후 실기 확인 — 2026-11-18 05:19~05:31 PHT

- 작업자 실수: Owner 의 「반영 전 확인」 지시 전에 #440·#441 이 자동 병합 등록으로 이미 병합됐다. 그래서 확인을 병합 뒤에 했다. FAIL 이면 되돌리기로 했다.
- 운영 웹: `ea39ab3`(#440·#441 포함). 05:19 PHT `/api/app/web-version` 로 확인.
- 설치본: S4 = 릴리스 75(웹 변경이라 설치본 무관), S2 = 릴리스 1.2.7 (76)(origin/main `ea39ab324` 빌드). 두 기기 `dumpsys package` versionCode=76 확인.
- 기기:
  - Samsung SM-M156S: 3버튼, q테스트1 로그인.
  - Xiaomi 24076RP19G: 제스처, zxzx11 로그인.

## S4 (#440, 웹) — Samsung 3버튼

| 항목 | 결과 | 증거 |
|---|---|---|
| LOUNGE 글 「⋯」 열고 ◁ | PASS — 메뉴만 닫히고 글 화면에 남음. 다음 ◁ 에 목록으로 | `v4-1-open` → `v4-1-back1` → `v4-1-back2` |
| 피드 「최신순」 정렬 메뉴 ◁ | PASS — 메뉴만 닫힘 | `v4-2-*` |
| 거래 채팅 이모지 패널 ◁ | PASS — 패널만 닫히고 방에 남음 | `v4-*` |
| 채팅방 메뉴 시트 ◁(회귀) | PASS — 시트만 닫힘 | `v4-8-roommenu-open` → `v4-8-roommenu-back1` |
| 첨부 시트·Android 사진 선택기 ◁(회귀) | PASS — 사진 선택기 → 첨부 시트 → 방 순으로 하나씩 닫힘. 아무것도 보내지 않음 | `v4-6-*`, `v4-7-attach-back` |
| 나머지 등록 위치(구매·판매 카드 메뉴, 매장 상세 ⋯, 알림함, 허브 플로팅 바 등) | NOT_PROVEN — 기기로 확인하지 않음. 코드는 계약 시험으로 등록 확인 | — |
| Xiaomi 제스처 S4 | NOT_PROVEN | — |

## S2 (#441, 네이티브·통화) — 릴리스 76

| 항목 | 기기 | 결과 | 증거 |
|---|---|---|---|
| 런처 실행 첫 화면 ◁ | Samsung 3버튼(서랍 검색 아이콘) | PASS — `TYPE_RETURN_TO_HOME`(시스템 처리, 이전 74 는 `TYPE_CALLBACK`), `wm_task_moved`, 최근 앱 #1 유지 | 05:26:05 로그, `s2-76-sam-first`·`s2-76-sam-first-back` |
| 런처 실행 첫 화면 ◁ | Xiaomi 제스처(독 아이콘) | PASS — `TYPE_RETURN_TO_HOME`, `wm_task_moved`, 최근 앱 #1 유지 | 05:27:37 로그, `s2-76-xia-first-back` |
| 하위 화면 ◁(회귀) | Samsung: 마켓·주소관리 → HOME / Xiaomi: DIPICK → HOME | PASS | `s2-76-sam-market*`, `s2-76-sam-sheet*`, `s2-76-xia-market*` |
| 네이티브 음성 통화 연결 중 ◁(회귀) | Samsung 수신(위쪽 알림 수락) | PASS — PiP 진입(`native_voice_auto_pip_entered source=back_invoked`), 앱 위 「통화 중」 막대 | 05:29:28, `s2-76-sam-connected`·`s2-76-sam-call-back` |
| 통화 중(PiP) 첫 화면 ◁ | Samsung | PASS — `TYPE_RETURN_TO_HOME`, 통화 PiP 유지, 하트비트 200 | 05:29:45, `s2-76-sam-call-first-back` |
| 통화 종료 직후 첫 화면 ◁ | Samsung | PASS — PiP 종료 버튼 `USER_END` 05:30:24 → 05:30:46 ◁ `TYPE_RETURN_TO_HOME` | `s2-76-sam-after-end` |
| 웹 통화(네이티브 소유 아님) 연결 중 ◁ — 켜짐 경로 | — | NOT_PROVEN — 실측 통화가 모두 네이티브라 이 경로를 만들 수 없었다 | — |
| 영상 통화, Xiaomi 통화 중 ◁ | — | NOT_PROVEN | — |
| iPhone | — | 해당 없음(Android 전용 변경) | — |

- `main_back_callback_enabled` 로그는 값이 바뀔 때만 남는다(코드 확인). 이번 측정 중 0건이다. 네이티브 통화는 꺼짐 유지라는 설계와 맞는다.
- 측정 중 부수 조작: 채팅방에서 「+」 를 잘못 눌러 첨부 시트와 Android 사진 선택기가 열렸다. ◁ 로 닫았고 보낸 것은 없다. 시험 음성 통화 1건(Xiaomi→Samsung, 05:28:42 발신, 약 1분 연결 후 Samsung 종료).

판정: 측정한 항목은 모두 PASS 이고 FAIL 은 0건이다. 그래서 되돌리지 않는다.

## 추가 측정 (NOT_PROVEN 항목) — 05:53~06:11 PHT · 두 기기 디버그 1.2.7 (76)(main `ea39ab3`, 인트로 세션이 설치 · Owner 재로그인)

### S2 — 영상 통화·Xiaomi

| 항목 | 기기 | 결과 | 증거 |
|---|---|---|---|
| 네이티브 영상 통화 연결 중 ◁ | Samsung 수신 | PASS — 앱으로 돌아가고 영상 PiP (`native_video_app_return_open source=back_invoked`) | 05:57:10, `s2-76-vid-back` |
| 영상 통화 중 첫 화면 ◁ | Samsung | PASS — `TYPE_RETURN_TO_HOME`, 통화는 PiP 로 유지, 하트비트 200 | 05:57:26, `s2-76-vid-first-back` |
| 영상 통화 중 ◁ (발신 쪽) | Xiaomi 제스처 | PASS — 앱으로 돌아가고 PiP + 「통화 중」 막대 | 05:57:43, `s2-76-xia-vid-back` |
| 통화 중 방 ◁ → 탭 첫 화면 ◁ | Xiaomi 제스처 | PASS — 방 → 대화 목록, 그다음 `TYPE_RETURN_TO_HOME`, 통화 유지 | `s2-76-xia-vid-b1`·`b2` |
| 영상 통화 종료 직후 첫 화면 ◁ | Samsung / Xiaomi | PASS — 둘 다 `TYPE_RETURN_TO_HOME`(05:59:20 / 06:00:51) | `s2-76-vid-after-end`, `s2-76-xia-vid-after-end` |
| 웹 통화(네이티브 소유 아님) 연결 중 ◁ — S2 켜짐 경로 | — | NOT_PROVEN — 재현 불가. 지금 코드는 Android 음성·영상의 수신(FCM)·발신을 모두 네이티브가 가져간다(`NativeVoiceCallRuntime:191·610`, `NativeVideoCallRuntime:162·581`). 웹 통화는 네이티브가 가져가지 못할 때만 생긴다 | 코드 대조 |

- 관찰(범위 밖, 판정 안 함):
  - Samsung 영상 통화 ◁ 뒤 앱 화면 위쪽에 「통화 중」 막대가 캡처에 없었다.
  - Samsung 음성 통화와 Xiaomi 영상 통화에서는 보였다.
  - 기대 동작은 확인하지 못했다.

### S4 — 나머지 메뉴

| 항목 | 기기 | 결과 | 증거 |
|---|---|---|---|
| LOUNGE 댓글 「⋯」(CommunityCommentItem) | Samsung | PASS — ◁1 메뉴만 닫힘, ◁2 목록 | `v4-9-comment-*` |
| 내 상품 구매자 문의 「⋮」 신고·차단(SellerTradeRow) | Samsung | PASS — 메뉴만 닫히고 같은 화면 유지(idx 2) | `v4-12-card-*` |
| LOUNGE 글 「⋯」 | Xiaomi 제스처 | PASS — ◁1 메뉴만 닫힘(idx 1), ◁2 목록 | `v4-13-xia-menu-*` |
| 알림함 패널(PhilifeHeaderNotificationInbox) | Samsung | 해당 화면 없음 — HOME·LOUNGE·DIPICK 종 모두 모바일에서 `/notifications` 페이지로 이동(◁ → 원래 탭, 정상) | `v4-10-*` |
| 매장 상세 「⋯」, 매장 목록 필터 | Samsung | 도달 불가 — DIPICK 매장 영역이 「배달 오픈 준비 중」으로 비활성 | `v4-11-browse` |
| 구매·판매 내역 카드 메뉴, 허브 플로팅 바, 모임 앨범, 채팅 목록 메뉴, 매장 주문 패널 | — | NOT_PROVEN — 측정 안 함(시간 내 화면 진입 경로 미확보) | — |

### 측정 중 작업자 실수·부수 조작
- 탭 좌표가 하단 시스템 막대에 떨어져 Samsung 최근 앱이 열렸다. 계산기 앱이 잠깐 앞으로 왔다(입력 확인 안 함). 최근 앱에서 DIBAY 로 복귀했다.
- Xiaomi: 화면 어둡게 하기 상태에서 탭이 빗나갔다.
  - Google 피드의 뉴스 1건이 Chrome 맞춤 탭으로 열렸다(◁ 로 닫음).
  - Chrome 새 탭이 1개 열렸다. 입력한 것은 없다.
- Samsung 영상 수신 때 카메라·마이크를 「이번만 허용」으로 눌렀다.
- 시험 영상 통화 2건:
  - 05:53:54: 권한 창 때문에 부재중이 됐다.
  - 05:56:37: 약 2분 연결 후 Samsung 에서 종료했다.
  - 이 사이에 발신이 되지 않은 시도가 1건 있다(05:55:22, 세션 없음).
- 영상 통화 캡처(`s2-76-vid-*`, `s2-76-xia-vid-*`, `x-vid-call`)에 Owner 카메라 영상이 찍혀 있다. 커밋하지 않는다.

## 남은 S4 측정 — 06:13~06:25 PHT · Samsung 3버튼 · 디버그 1.2.7 (76)(main `ea39ab3`) · q테스트1 로그인

| 대상(컴포넌트) | 들어간 방법 | 결과 | 증거 |
|---|---|---|---|
| 판매 내역 카드 「⋮」(SalesHistoryCard) | `/philife/sales` **주소 직접 이동**(앱 안 링크 없음) | PASS — ◁ 메뉴만 닫힘, 같은 화면(idx 3) | `v4-17-sales-*` |
| 내 글 「⋯」 수정/삭제(CommunityOwnPostMoreMenu) | MY → LOUNGE → 내가 쓴 글 → 글 | PASS — ◁ 메뉴만 닫힘, 글 유지 | `v4-18-ownpost-*` |
| 내 상품 카드 「⋯」 시트(MyProductCard, 회귀) | MY → 마켓 → 진행중 거래 | PASS — 시트만 닫힘 | `v4-14-mycard-*` |
| 주문 채팅 구매자 「내역」 시트(StoreOrderBuyerRoomSheet) | telRING → 주문 채팅 → 방 | PASS — 시트만 닫히고 방 유지 | `v4-19-order-*` |
| 매장 관리 메뉴 서랍(회귀) | DIPICK → 매장 진입 → 메뉴 | PASS — 서랍만 닫힘 | `v4-20-owner-menu` |
| 공개 매장 미리보기(OwnerStorePreviewModal) | 매장 관리 메뉴 → 공개 매장 미리보기 | PASS — 미리보기만 닫히고 대시보드 유지 | `v4-20-preview-*` |
| 사장님 주문 채팅 패널(OwnerStoreOrderChatSlidePanel) | 주문 관리 → 전체 → 「채팅」 | PASS — 패널만 닫히고 주문 목록 유지 | `v4-21-ownerchat-*` |
| 판매자 「주문」 패널(StoreOrderSellerOrderPanel) | 위 채팅 패널 → 「주문」 | PASS — ◁1 주문 패널만 닫힘(채팅 패널 유지), ◁2 채팅 패널 닫힘 | `v4-22-sellerpanel-*` |
| 정산 주문 상세 창(StoreCommissionLedgerTable) | 관리 → 수수료·캐시 내역 → 「상세」 | PASS — 창만 닫히고 같은 화면(idx 10) | `v4-23-ledger-*` |
| 모임 참여 미리보기(OpenGroupJoinPreviewFullScreen) | `/community-messenger?open=public-group-find` **주소 직접 이동**(앱 안 링크 없음) → 「참여」(가입 안 함, 미리보기 설정 기본값 켜짐 확인) | ◁ 동작 PASS — 마지막에 연 미리보기만 닫힘, 다음 ◁ 에 「모임 찾기」 시트 닫힘. **화면 FAIL(범위 밖, 보고만)** — 미리보기가 「모임 찾기」 시트 **아래**에 그려져 보이지 않음 | `v4-24-*` |

도달 불가·측정 불가 (코드·운영 DB 확인, 기기 동작 NOT_PROVEN):

| 대상 | 이유 |
|---|---|
| 구매 내역 카드(PurchaseHistoryCard) | 화면에 그리는 곳이 없음(타입만 쓰임). `/mypage/purchases` 는 메신저 거래 목록으로 이동 |
| 거래 허브 플로팅 바(HomeTradeHubFloatingBar) | `/mypage/purchases`·`/mypage/sales` 에서만 나오는데 두 주소 모두 다른 화면으로 이동 |
| 채팅 목록 방 메뉴(ChatRoomListMenu) | 이 메뉴를 담은 카드(ChatRoomCard·GeneralChatRoomCard)를 그리는 곳이 없음 |
| 예전 주문 채팅 위쪽 서랍(StoreOrderBuyerChatTop) | q테스트1 주문 77건 모두 메신저 방이 있어 예전 화면이 항상 메신저로 이동 |
| 모임 앨범 사진 보기(MoimAlbum) | q테스트1 모임 4개 모두 종료, 앨범 사진 0건 — 운영 데이터를 새로 만들지 않음 |
| 매장 상세 「⋯」, 매장 목록 필터 | DIPICK 매장 영역 「배달 오픈 준비 중」으로 비활성 |
| 알림함 패널(PhilifeHeaderNotificationInbox) | 모바일에서 모든 종(HOME·LOUNGE·DIPICK·글 상세)이 알림 페이지로 이동 |
| 매장 홈 검색 창(StoresHomeSearchModal) | 불러오는 곳 없음(코드 검색 0건) |
| 채팅 첨부 메뉴(ChatInputBar attach) | 모바일은 사진 시트 경로라 이 메뉴가 열리지 않음(조건 `!preferMobileImageSheet`) |

부수 사항:
- 06:19~06:21 다른 세션이 같은 9333 포트를 잠시 바꿔 씀(그 세션 보고). 그 사이 제 결과(미리보기 06:19)는 기기 캡처와 주소(q테스트1 매장 ID)로 Samsung 화면임을 확인했다.
- 범위 밖 관찰: `/philife/sales` 화면 제목이 한국어 화면에서 영어 「Trade management」로 나옴. 마켓 카드 「더보기 메뉴」 버튼은 탭 위치가 카드 본문에 걸려 상품 화면이 열림(◁ 로 복귀).
