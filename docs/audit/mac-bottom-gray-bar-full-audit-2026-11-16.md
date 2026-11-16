# 맥(Designed for iPad) 키보드 회색 띠 · 쓰기 화면 키보드 처리 — 전수 감사 (2026-11-16 · 보고만)

기준: 운영 main `9b1d7c106` (11-16 17:39 PHT). 맥 실측: 11-16 20:04~20:20 PHT, 맥 DIBAY(com.dibay.ph, Xcode 설치본 · 디버거 연결 불가 = Release), 로그인 계정 그대로, 입력·등록·저장 0건(입력칸 클릭만).
증거 캡처 01~11: 작업자 로컬 보관(회원 이름·전화번호가 보여 저장소에 올리지 않음). 화면 구조 기록만 `docs/audit/mac-bottom-gray-bar-2026-11-16-device/` 에 커밋.

## 0. 먼저 정정 (작업자 잘못)

- **회색 띠를 고친 코드는 어디에도 없다.** 11-14 이후 모든 브랜치·작업 폴더·세션 기록 조회 결과 수정 0건.
- 11-15 작업은 계측만 했고(§11 「오후 미재현, 원인 NOT_PROVEN」) 대화방·LOUNGE 상세 2곳만 봤다. 「일부 수정」이 아니라 **수정 없음**이다.

## 1. 맥 실측 결과 (오늘, 직접 클릭)

| # | 화면 | 동작 | 결과 | 캡처 |
|---|---|---|---|---|
| 1 | LOUNGE 글쓰기 (`/philife` 위 작성기) | 본문·제목 칸 클릭 | **FAIL** — 창 맨 아래 회색 띠, 서식 도구줄이 띠 위로 밀려 올라감, 오른쪽 세로 스크롤 막대 생김 | 01 |
| 2 | LOUNGE 글 상세 | 입력 없이 빈 곳 클릭 + End 키 | **FAIL** — 입력 없이도 띠가 하단 탭을 덮음(탭 아이콘이 띠 속에 흐리게 비침) | 02 |
| 2-1 | 위 상태에서 뒤로 → 피드 목록 | 화면 이동 | **FAIL** — 띠가 다른 화면으로 따라감 | — |
| 2-2 | 띠가 덮은 하단 탭(telRING) 클릭 2회 | 탭 이동 | **FAIL — 탭이 눌리지 않음**(띠가 클릭을 가로챔) | — |
| 2-3 | 입력칸 밖에서 Esc | — | 띠 사라짐 → 탭 정상 | — |
| 3 | telRING 대화방 | 메시지 칸 클릭 | **FAIL** — 띠 + 화면 전체가 위로 밀려 대화방 머리글·목록 제목이 잘림. 입력칸 안에서는 Esc 로도 안 사라짐 | 03·04 |
| 4 | MARKET 거래 글쓰기 (Write trade post) | 제목·설명 칸 클릭 | **FAIL** — 띠, Cancel/Post 줄이 띠 위로 밀림 | 05 |
| 5 | 통합 검색 (DIPICK 검색창 진입) | 검색칸 클릭 | **FAIL** — 띠 | 06 |
| 6 | MY 프로필 수정 시트 | 상태 칸 클릭 | **FAIL** — 띠가 시트의 Save 버튼 아래쪽 반을 덮음 | 07 |
| 7 | 사장님 매장 Basic info | 띠가 남은 채 진입 / 매장 소개 칸 클릭 | **FAIL** — 진입 시 띠가 Cancel/Save 줄을 덮음, 클릭 후 줄이 띠 위로 밀림 | 08 |

NOT_PROVEN(오늘 맥에서 안 본 것): CREW 화면 전부, 댓글 입력, 거래 채팅·주문 채팅, 사장님 상품·쿠폰·배너 폼, 매장 장바구니 요청사항, 로그인·전화 인증, 신고 사유 대화상자. iPhone·iPad·Android 는 이번 감사에서 실측 안 함.

### 실측으로 확정된 성질
- 띠는 **화면별이 아니라 앱 전체 공통**: 어느 화면이든 웹뷰가 키보드 입력 상태(첫 응답자)가 되면 나타나고, 화면을 옮겨도 남는다.
- **Esc(키보드 내리기)로 사라진다** → 시스템 키보드 표시 층(맥에서 iPad 앱에 그려지는 키보드 막대)이라는 직접 근거. 11-16 오전 보고서의 1순위(스크롤 가장자리 효과) 추정은 **이 실측으로 뒤집힌다** — 정정.
- 띠는 **클릭을 가로챈다**(하단 탭이 안 눌림) — 단순 외형 문제가 아니라 조작 불가 결함.
- 웹은 띠 높이만큼 「키보드가 열렸다」고 받아 화면을 밀어 올린다(글쓰기 도구줄·거래 Post 줄·사장님 저장 줄이 올라감, 대화방은 화면 전체가 밀려 머리글 잘림).

## 2. 원인 — 확정 (계측 2026-11-16 20:30~20:50 PHT)

조건: main `9b1d7c106` · iOS 1.2.3 (48) Debug · 맥 「My Mac (Designed for iPad)」 · 디버거 없는 임시 스킴으로 실행 후 lldb 연결 · 통합 검색칸 포커스로 띠 재현(캡처 09).

| 확인 | 결과 |
|---|---|
| 띠가 보일 때 창 목록 | 앱 창 `UIWindow`(2094×1402) + **시스템 키보드 창 `UITextEffectsWindow`** |
| 키보드 창 안 | `UIInputSetHostView` frame **(0 1358; 2094 44)** → `UIKBInputBackdropView`(키보드 배경) + `UIInputView` 44pt (좌·우 `_UIInputViewContent` 1047씩) = **iPad 하드웨어 키보드 단축 막대** |
| 웹뷰 입력 담당 `WKContentView` 의 `inputAssistantItem` | 앞쪽 묶음: 실행 취소·다시 실행·붙여넣기 / 굵게·기울임·밑줄 / 서식 · 뒤쪽 묶음: ∧ ∨ (이전·다음 칸) — 막대에 그려지는 버튼 묶음 |
| 그 자리에서 앞·뒤 묶음을 비우고 입력 뷰 다시 읽기 | **띠 즉시 사라짐**(커서 유지, 캡처 10), 키보드 막대 높이 44 → **0** |
| 비운 뒤 다른 입력칸(글쓰기 본문)·telRING 대화방 입력 | 띠 없음, 대화방 머리글 잘림 없음(캡처 11), 묶음은 빈 채 유지 |
| 웹뷰 가로·세로 스크롤 막대(15pt) | 존재하나 띠와 무관(띠 제거 후에도 그대로, 화면에 안 보임) |

**원인 확정**: 맥은 iPad 앱을 「하드웨어 키보드가 붙은 iPad」로 다루어, 입력칸이 포커스되면 iPad 키보드 단축 막대(44pt, 유리 배경)를 창 맨 아래에 그린다. 막대에 버튼 묶음이 있으면 표시된다. 우리 네이티브 `DibayWebViewKeyboardChrome.swift` 는 ^/v/✓ 막대(`inputAccessoryView`)만 없애고 이 단축 막대(`inputAssistantItem`)는 그대로 둔다.
- 띠가 클릭을 막고, 웹이 화면을 밀어 올리는 것(머리글 잘림·도구줄 밀림)은 모두 이 44pt 막대를 시스템이 키보드로 보고하기 때문 — 막대가 0 이 되면 함께 사라짐(대화방 확인).
- Debug 첫 실행의 글쓰기 본문에서는 처음엔 안 나왔고 검색칸 포커스 뒤 나타남 — 묶음이 처음 채워지는 시점 차이로 보이며, 묶음을 항상 비우면 시점과 무관.
- 정정: 오전 보고 1순위(스크롤 가장자리 효과)는 틀림. 실측 로그 `docs/audit/mac-bottom-gray-bar-2026-11-16-device/lldb-view-hierarchy-bar-visible.txt`.

## 3. 쓰기·입력 화면 키보드 처리 — 코드 전수 (도메인별)

(코드만 읽은 결과 · 실제 동작은 §1 에서 본 것 외 NOT_PROVEN)

공통 장치: `KeyboardViewportRootProbe`(`app/layout.tsx:149`, 전 화면 `html[data-kb-open]`), 하단 탭 키보드 숨김 `BottomNavKeyboardHideProbe`(`ConditionalAppShell.tsx:504`, 탭 보이는 경로만), 시트 3종 `DibayBottomSheet`·`DibayFullSheet`·`DibayUsableAreaSheet`(Form SSOT 로 보이는 영역 띠에 맞춤), `DibayDialog`/`dibayPrompt`(키보드 장치 **없음**).

### 3-1. HOME · LOUNGE(FEED) · MARKET · 검색 · CREW
(표: §부록 A)

### 3-2. telRING · 채팅 · MY · 로그인
(표: §부록 B)

### 3-3. DIPICK · 매장 · 사장님
(표: §부록 C)

## 4. 같은 종류인데 갈라진 곳 (코드)
회색 띠와 별개로 코드에서 찾은 갈라짐 (보고만 · 실기 NOT_PROVEN):
1. **키보드 처리가 아예 없는 입력 화면**: 검색 3종(`/search`·`/market/search`·`/moim/search`)·배달 검색·매장 메뉴 검색, 거래 상세 채팅·커뮤니티 댓글, 모임 관리 4화면, 메신저 방 시트·친구 고르기, 필수 전화 인증 페이지·공개 계정 삭제, 주문 후기·메뉴 담기 시트, 사장님 인라인 입력 약 12곳, 신고·확인 대화상자(DibayDialog·dibayPrompt).
2. **하단 바가 키보드를 안 따르는 곳(iOS 가림 가능)**: 주문 후기 제출 바, 장바구니 결제 바, 매장 상세 장바구니 띠, 메뉴 담기 시트 담기 바, 친구 고르기 「그룹 만들기」 버튼(탭 높이 고정).
3. **같은 종류인데 장치가 다름**: 글쓰기 시트(필라이프 층 맞춤 vs 거래 버튼 패딩), 하단 등록 버튼 3벌(SubmitButton·ProductForm 복사본·MoimStickyFooter), 댓글 3갈래, 신고 입력 5가지 부품, 전화 인증 Box 3가지 처리, 사장님 폼 포커스 보정 유무, 메신저 방 한 화면에 키보드 측정 2벌.
4. **iOS 바깥 탭 키보드 닫기**: 시트·`/search`·`/products/new`·주소 편집에만 있고 `/philife/write` 페이지·`/write*`·상품 수정·사장님 폼·장바구니 등에는 없음.
5. **하단 탭 정책 어긋남**: `/group-chat/[id]`·`/address/select`·`/onboarding/profile` 은 입력 화면인데 하단 탭 표시 대상.
6. **죽은 코드**: `use-cm-room-kb-offset.ts`, `StoresHomeSearchModal.tsx`.

이 목록은 이번 지시(회색 띠) 범위 밖이다. 고칠지는 별도 승인 항목이다.

## 5. 설계안 (구현은 Owner 승인 후)

1. **수정 = 네이티브 한 곳** `ios/App/App/DibayWebViewKeyboardChrome.swift` (모든 화면 공통 진입점):
   - 지금처럼 `WKContentView` 를 한 번만 바꿔치기해, `inputAssistantItem` 을 읽을 때마다 앞·뒤 버튼 묶음을 빈 배열로 만든다(원래 항목은 그대로 돌려줌). 계측에서 같은 조작으로 띠가 0 이 됨을 확인.
   - 웹 코드·화면별 수정 없음. 통화·AppDelegate 무관(기존 파일 주석 범위 그대로).
2. 영향: 맥·iPad(하드웨어 키보드)에서 단축 막대의 실행 취소·붙여넣기·굵게·∧∨ 버튼이 사라짐(키보드 단축키 ⌘Z·⌘V 등은 그대로). iPhone 은 이 막대를 그리지 않아 화면 변화 없음 — 실기로 확인 필요.
3. 분류: 네이티브 → iOS build 48 → 49, 맥·iPhone 재설치 필요. Android 무관.
4. 실측 행렬(맥): LOUNGE 글쓰기·글 상세(입력 없음 포함)·telRING 대화방·MARKET 글쓰기·통합 검색·MY 프로필 시트·사장님 기본 정보 + 하단 탭 클릭 가능 여부. iPhone: 같은 화면에서 키보드 위 영역 회귀 없음.
5. 범위 밖(보고만): §4 의 화면별 키보드 처리 갈라짐.


## 6. 구현 기록 (Owner 「수정 진행」 2026-11-16)
- `ios/App/App/DibayWebViewKeyboardChrome.swift`: `WKContentView.inputAssistantItem` 에 덮어쓰기를 **WKContentView 에만** 추가(UIResponder 전체는 건드리지 않음). 원래 항목을 받아 앞·뒤 버튼 묶음만 비워 돌려준다 — 읽을 때마다 비우므로 묶음이 언제 채워지든 막대는 0.
- iOS build 48 → 49 (4곳). MARKETING_VERSION 1.2.3 유지. Android 무변경.
- 웹 코드 무변경. 통화·AppDelegate 무변경.

---
## 부록 A. HOME · LOUNGE · MARKET · 검색 · CREW (코드)

| 도메인 | 화면 | 경로 | 키보드 처리 | 하단 고정층 동작 |
|---|---|---|---|---|
| HOME | 홈 | `/`, `/home` | 입력 없음 | 하단 탭 |
| FEED | 피드 목록 | `/philife` | 입력 없음 | 하단 탭 |
| FEED | 동네 필터 지역 검색 시트 | `/philife` 위 | DibayBottomSheet | 시트가 따라 올라감 |
| FEED | 글쓰기 시트 | `/philife` 위 | `usePhilifeComposerKeyboardStage`(층을 보이는 영역 띠에 맞춤) | 도구줄 따라 올라감 |
| FEED | 글쓰기·수정 페이지 | `/philife/write` | 같은 장치 | 도구줄 따라 올라감 · **바깥 탭 키보드 닫기 없음(시트와 다름)** |
| FEED | 링크·사진 설명 입력 시트 | 작성기 위 | DibayBottomSheet | 따라 올라감 |
| FEED | 글 상세 댓글·답글·수정 | `/philife/{id}` | Form SSOT + 포커스 보임 | 본문 안 인라인 |
| FEED | 글·댓글 신고 사유 | `/philife/{id}` | **DibayDialog — 장치 없음** | 중앙 대화상자 |
| FEED/MY | 판매내역 신고 「기타」 | `/philife/sales` | DibayBottomSheet | 따라 올라감 |
| MARKET | 목록 필터 가격 | `/market` | DibayBottomSheet | 따라 올라감 |
| MARKET | 지역 검색 시트 | `/market` | DibayBottomSheet | 따라 올라감 |
| MARKET | 목록 카드·광고 신고 | `/market`, `/search` | DibayFullSheet / DibayBottomSheet | 시트 안 |
| MARKET | 거래 글쓰기 시트 | `/market` 등 | Form SSOT + `SubmitButton` 패딩 보정(**층은 띠에 안 맞춤 — 필라이프와 다름**) | Post 줄 따라 올라감 |
| MARKET | 글쓰기 페이지 | `/write*` | SubmitButton | 따라 올라감 · 바깥 탭 닫기 없음 |
| MARKET | 상품 수정 | `/products/{id}/edit` | SubmitButton | 따라 올라감 · 바깥 탭 닫기 없음 |
| MARKET | 상품 등록(옛 폼) | `/products/new` | **자체 복사본**(ProductForm footer) | 따라 올라감 |
| MARKET | 자주 쓰는 문구 | 글쓰기 안 | DibayBottomSheet | — |
| MARKET | 거래 장소 고르기 | `/market/trade-meet-spot` | Form SSOT | 도구줄 따라 올라감 |
| MARKET | 상세 판매자 채팅 입력 | `/post/{id}` | **없음** | 고정층 없음 |
| MARKET | 상세 커뮤니티형 댓글 | `/post/{id}` | **없음**(피드 댓글은 있음) | — |
| MARKET | 상세 댓글 신고 | `/post/{id}` | **dibayPrompt — 없음** | 중앙 대화상자 |
| 검색 | 통합 검색 | `/search` | 없음(상단 입력) | — |
| 검색 | 거래 찾기 | `/market/search` | 없음 · 바깥 탭 닫기 없음 | — |
| CREW | 모임 찾기 | `/moim/search` | 없음 · 바깥 탭 닫기 없음 | 하단 탭 |
| CREW | 만들기·글쓰기·프로필·일정 | `/moim/new`, `/moim/{id}/write` 등 | `MoimStickyFooter` | 버튼 줄 따라 올라감 |
| CREW | 게시글 댓글 | `/moim/{id}/posts/{pid}` | MoimStickyFooter(하단 고정 입력줄 — 피드와 다른 형태) | 따라 올라감 |
| CREW | 참여 동기·가입 신청·신고 시트 | `/moim/**` | DibayUsableAreaSheet | 따라 올라감 |
| CREW | 관리 정보 수정·모임 닫기·방장 요청·초대 검색 | `/moim/{id}/manage/*` | **없음**(만들기와 다름) | 인라인 버튼 |
| CREW | 관리 게시판 이름·거절 사유·멤버 사유 | `/moim/{id}/manage/*` | DibayBottomSheet | 따라 올라감 |

## 부록 B. telRING · 채팅 · MY · 로그인 (코드)

| 도메인 | 화면 | 경로 | 키보드 처리 | 하단 고정층 동작 |
|---|---|---|---|---|
| telRING | 방 입력창(1:1·그룹·거래·주문 방) | `/community-messenger/rooms/[id]` | 방 전용 셸 `useCmRoomVisibleViewportShell`(자체 기준 높이) | 입력창 따라 올라감 |
| telRING | 방 시트(서랍 제목·참여자 검색·그룹 정보·대화 내 검색) | 같은 방 | **전용 처리 없음**(`--kb-safe-bottom` 만, `RoomSheets.tsx:175-203`) | iOS 덮임 가능(미확인) |
| telRING | 친구 아이디 검색·채팅 검색 | `/community-messenger` | 공통만 | 하단 탭 숨김 |
| telRING | 친구 고르기(그룹 만들기) | `?section=pick` | 공통만 | **만들기 버튼이 탭 높이에 고정**(`FriendPickerScreen.tsx:191-195`) |
| telRING | 모임 찾기 시트·그룹 만들기 시트 | 메신저 홈 | `MessengerHomeBottomSheetShell`(Form) | 따라 올라감 · 여백 변수 서로 다름 |
| telRING | 오픈 모임 참여 미리보기 | 메신저 홈 | Form + 포커스 보정 | 따라 올라감 |
| 채팅 | 거래·주문 채팅 | `/chats/[id]` → CM 방 | 방 전용 셸 | 따라 올라감 |
| 채팅 | 구 채팅 상세 | `/chats/[id]`(남은 경우) | `ChatInputBar`(Form) | 따라 올라감 |
| 채팅 | 그룹채팅(실험) | `/group-chat/[id]` | ChatInputBar | **하단 탭 표시 대상 경로** |
| MY | 프로필 수정 시트 | `/mypage?edit=profile` | DibayUsableAreaSheet | 저장 따라 올라감 (맥 실측: 띠가 Save 덮음) |
| MY | 아이디 확정 시트 / 페이지 | `/mypage`, `/mypage/required/dibay-id` | 시트 / `MyStickyCta` | 서로 다름 |
| MY | 전화 인증 시트 / 필수 페이지 / 프로필 설정 | 3곳 | DibayUsableAreaSheet / **없음** / 저장 바 | 같은 부품 3가지 처리 |
| MY | 고객센터 검색 / 댓글 | `/mypage/customer-center/*` | 없음 / Form | 댓글 바 따라 올라감 |
| MY | 1:1 문의 작성·답글 | 모달 | DibayUsableAreaSheet | 따라 올라감 |
| MY | 회원 탈퇴 / 공개 삭제 요청 | `/mypage/section/settings/leave`, `/account/delete` | MyStickyCta / **없음** | 서로 다름 |
| MY | 주문 취소 사유 / 환불 사유 | `/mypage/store-orders*` | DibayBottomSheet / 없음 | — |
| MY | 주문 후기 작성 | `/mypage/store-orders/[id]/review` | **없음** | iOS 덮임 가능(미확인) |
| MY | 포인트 충전·피드 광고 신청 | `/mypage/points/charge`, `/mypage/ads/feed-request` | MyStickyCta | 따라 올라감 |
| MY | 주소 검색 / 상세 / 지도 선택 | `/mypage/addresses/*`, `/address/select` | 없음 / Form + 머리글 고정 / Form | `/address/select` 는 하단 탭 표시 대상 |
| 로그인 | 로그인 화면·로그인 팝업 | `/login`, 오버레이 | 포커스 보정 + 버튼 유지 | 따라 올라감 |
| 온보딩 | 이름 입력 | `/onboarding/profile` | 공통만 | 하단 탭 표시 대상 경로 |
| 알림 | 알림 센터 | `/notifications` | 텍스트 입력 없음 | — |

## 부록 C. DIPICK · 매장 · 사장님 (코드)

| 도메인 | 화면 | 경로 | 키보드 처리 | 하단 고정층 동작 |
|---|---|---|---|---|
| 고객 | 배달 검색 | `/stores/search` | 없음(상단 입력) | 하단 탭 숨김 |
| 고객 | 매장 상세 메뉴 검색 | `/stores/[slug]` | 없음 | **장바구니 띠 `fixed bottom-0` 처리 없음** |
| 고객 | 메뉴 담기 시트 요청사항 | `/stores/[slug]` | **없음**(시트 공통 처리 비켜 감) | 담기 바 iOS 덮임 가능 |
| 고객 | 리뷰 신고 시트 | `/stores/[slug]` | DibayBottomSheet | 따라 올라감 |
| 고객 | 매장·상품 신고 | `/stores/[slug]/report` | 없음 | 본문 버튼 |
| 고객 | 장바구니·주문서 | `/stores/[slug]/cart` | Form + 포커스 보정, **결제 바 인셋 없음** | iOS 덮임 가능 |
| 고객 | 주문 후기(페이지·슬라이드) | `/orders/store/[id]/review`, `/orders` | **없음** | iOS 덮임 가능 |
| 고객 | 주문 취소 사유 | `/orders` | 없음 | — |
| 고객 | 주문 채팅(슬라이드) | `/orders` | 메신저 방 셸 · 채팅 경로 예외 정규식에 빠짐 | 미확인 |
| 사장님 | 입점 신청·상품 등록/수정·쿠폰·광고 배너·팝업·광고 상세 | `/stores/owner/*` | `useOwnerAdminFormKeyboard` · **포커스 보정 없음** | 저장 바 따라 올라감 |
| 사장님 | 기본 정보·매장 설정·메뉴 카테고리 | `/stores/owner/*` | 위 + 포커스 보정 | 저장 바 따라 올라감 (맥 실측: 띠가 저장 바를 덮음/밀어 올림) |
| 사장님 | 배너·공지 편집 시트, 주문 수락·거절, 전화 인증·위치 시트 | `/stores/owner/*` | Dibay 시트 + 사장님 시트 인셋 | 따라 올라감 |
| 사장님 | 리뷰 답글·문의 답변·주문 검색·주문 답글·상품 검색·정산 필터·재무 3종·상품권·이벤트 프로모션 (약 12곳) | `/stores/owner/*` | **없음** | 상품권·이벤트 프로모션은 하단 저장 바 규칙 미적용 |
| 공통 | 고객센터 문의 작성 | FAB | DibayUsableAreaSheet | 따라 올라감 |
| (죽은 코드) | `StoresHomeSearchModal.tsx`, `use-cm-room-kb-offset.ts` | — | 쓰는 곳 0 | — |
