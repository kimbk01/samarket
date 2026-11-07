# 광고 전체 감사 — 결함·개선안 (2026-11-03 · 승인 요청)

- **범위**: 인트로 · 전역 팝업 · 도메인 배너(거래·커뮤니티·배달·마이) · 당겨서 새로고침(PTR) 띠 광고 · 상위노출(유료노출) · 광고 어드민 공통(SSOT·권한·메뉴)
- **방식**: 읽기 전용. 코드는 `origin/main` `92222cc30` 기준으로 대조했습니다. 인트로·팝업·PTR·배달 배너·상위노출 투영 파일은 로컬 브랜치와 main 이 같습니다. 운영 DB `ckdosyydvgzqwpbwuhon` 에는 SELECT 만 실행했고, 테스트 DB 2곳은 사용하지 않았습니다. 코드·DB 변경은 0건입니다.
- **판정 수준**: 전부 **코드 수준**입니다. Owner 계정·휴대폰 화면, 실기기, Production 화면은 보지 않았으므로 해당 항목은 모두 **NOT_PROVEN** 입니다.
- **작성자가 직접 다시 확인한 결함**: R-1, G-4, P-2, A-1. 나머지는 영역별 감사 결과(file:line 근거 포함)를 옮긴 것입니다.

## 0. 운영 현재 상태 (SELECT · 14:56 PHT)

| 영역 | 운영 상태 | 앱 노출(코드 추적 결과) |
|---|---|---|
| 인트로 | Live = unpublished(rev 34, 10-12). 게시본 12건 중 11건이 10초 | 0 |
| 전역 팝업 | active/scheduled 0건. paused 6건(모두 기간 만료), pending_review 1건 | 0 |
| PTR 띠 | QA 캠페인 1건(paused·만료), 나머지 draft 2건 | 0 |
| 피드 배너(거래·커뮤니티) | status=active 5건, 모두 기간 만료 | 0 |
| 배달 배너 | 홈 상단 3 · 홈 중간 1 · 업종 상단 8건, 모두 샘플 매장 | 위치 범위에 따라 다름(NOT_PROVEN) |
| 마이 배너 | 0행 | 0 |
| 상위노출 주문 | active 0건. 보류 금액 중 미해제 0건, 상태 조합 정상 | 0 |

→ 지금 운영 앱에 유료 광고가 실제로 나오는 곳은 **배달 샘플 배너뿐**입니다. 아래 결함 대부분은 광고가 다시 켜지는 순간 드러나는 **잠복 결함**입니다.

## 1. 우선 수정 대상 (돈·권한·노출 손실)

| ID | 심각도 | 결함 | 근거 | 최소 수정 |
|---|---|---|---|---|
| **P-2** | P0 잠복 | 상위노출을 결제한 글이 목록에서 사라짐. 활성 주문이 4건 이상이면 뽑히지 않은 글은 모든 페이지에서 빠지고, 판매완료된 광고 글은 판매완료 구간에서도 빠짐 | `lib/promotion/feed-promotion-projection.ts:155,167` — 끼우지 않은 글까지 `activePromotionIds` 전체로 제외 | 제외 대상을 이번 페이지에 실제로 끼운 id(`selectedSet`)로 한정 |
| **P-3** | P1 | 광고 글이 지역·가격·판매상태 필터를 무시하고 끼워짐. 「3km」「판매완료 탭」에도 다른 도시의 판매중 광고 글이 섞임 | `feed-promotion-projection.ts:173-226` 은 카테고리만 거름. 일반 목록은 `home-posts-route-core.ts:766-772` 에서 전체 필터 적용 | 일반 목록과 같은 조건을 광고 후보에 적용. 판매완료 탭에서는 끼우지 않음 |
| **A-1** | P1 권한 | 피드 배너 승인·반려(포인트 환급)·종료와 상품 가격 PATCH 를 `ads` 권한이 없는 관리자도 할 수 있음 | `app/api/admin/feed-ad-requests/[id]/route.ts:255`, `app/api/admin/feed-ad-products/route.ts:30` 가 `requireAdminApiUser` 만 검사. 계약: `admin-route-access.ts:222-225` 「feed-ads = ads 권한」 | `requireAdminPermission("ads")` 적용. 가격 PATCH 에 revision 409·사유 필수 추가 |
| **A-2** | P1 권한 | 커뮤니티 상위노출 가격을 거래 관리자가 수정할 수 있음 | `app/api/admin/member-promotion-products/route.ts:113` `requireTradeAdmin` 만 검사. 계약은 `requireCommunityAdmin("promotion")` | 행의 domain 이 community 이면 커뮤니티 권한 요구 |
| **R-1** | P1 | PTR 띠 CTA 를 연타하면 click·landing 이 중복 기록됨. 운영에서 노출 1건에 click 2건 기록 | `components/ptr/DibayPtrRevealAdLayer.tsx:169-197` `onCta` 에 `finished` 확인 없음 | 함수 시작에 `if (ex.finished) return;` |
| **I-3** | P1 | 「인트로 최대 5초」(Owner 10-02) 규칙이 재게시에서 검사되지 않음. 10초 게시본 11건을 재게시로 다시 Live 에 올릴 수 있음 | `lib/launch-intro/server.ts:383-397`, SQL `launch_intro_set_state` | 재게시에도 `LAUNCH_INTRO_TOTAL_MAX_MS` 검사. 넘으면 버튼 비활성화 |
| **P-4** | P2 (DB) | 중지된 상위노출 주문이 있는 글에 새 주문을 낼 수 있음. 재개하면 활성 주문이 2개가 됨 | 운영 함수 `purchase_member_content_promotion` 의 중복 확인이 `order_status='active'` 만 봄 | 중복 확인에 `'paused'` 추가(**운영 DB 적용 = 별도 승인**) |

## 2. 동작 결함 (계약과 다름)

| ID | 심각도 | 결함 | 근거 | 최소 수정 |
|---|---|---|---|---|
| G-4 | P1 | 팝업 우선순위: 계약은 「영역 지정 > 전체 > 우선순위」인데, 코드는 「한 번도 안 나온 것」을 먼저 비교함. 어드민 안내 문구와 실제 동작이 다름 | `lib/platform-popup/popup-rotation.ts:25-27` | 영역 지정·우선순위 비교를 노출 순환보다 먼저 수행 |
| G-6 | P1 | `close_only` 팝업이 영역을 옮길 때마다 다시 뜸. 예: 「전체」 팝업 CTA `/market` 을 누르면 도착 화면에서 같은 팝업이 다시 뜸. 계약은 연속 팝업 금지 | `components/platform-popup/GlobalPopupHost.tsx:249-261` | `close_only` 도 같은 앱 세션 동안 재노출 금지 |
| G-7 | P1 | 삭제·숨김된 상품·게시글·매장으로 가는 팝업 CTA 도 노출 대상에 들어감 | `lib/platform-popup/popup-event-destination-availability.ts:28-32` `NOT_ENTITY_CHECKED` | 후보 조회 시 3종의 존재·공개 여부를 한 번에 확인 |
| G-8 | P1 | 확인창·바텀시트가 열려 있어도 팝업이 그 위에 겹칠 수 있음. `criticalDialog` 플래그를 켜는 곳이 고객센터 모달뿐 | grep 결과 | 공통 오버레이 스택의 열린 창 수를 노출 조건에 추가 |
| I-4 | P1 | 인트로 첫 프레임 전에 오류나 백그라운드 전환이 생기면 OS 스플래시를 닫는 주체가 사라질 수 있음. 네이티브 타임아웃 유무는 확인 못 함 | `components/launch-intro/LaunchIntroRoot.tsx:179-185,212-230`, `lib/startup/startup-metrics.ts:393` | 해제 전 error/background 종료는 `abortLaunchIntroToCommunity` 로 넘김 |
| R-5 | P2 | PTR 빈도 억제 기록(POST)을 기다리지 않고 재조회해서, SESSION/DAY 모드에서도 같은 광고가 다시 나올 수 있음 | `lib/.../ptr-reveal-client.ts:153-183` | POST 완료 후 재조회, 또는 로컬 보류 |
| R-6 | P2 | 태블릿 회전·분할 화면처럼 폭이 바뀌면 디코드되지 않은 이미지가 노출될 수 있음(계약 §3.6 위반) | `ptr-reveal-client.ts:116-123` 캐시 키가 표면 하나뿐 | 캐시 키에 변형(phone/tablet) 포함 |
| I-5 | P2 | 내용이 빈 인트로 초안을 게시하면 확인창과 사유 입력을 거친 뒤 「오류: scene_empty」 원문이 뜸 | `LaunchIntroAdminPage.tsx:1386`, `document.ts:520` | 버튼 전에 미리 검증하고 한국어 문구로 매핑 |
| I-6 | P2 | 인트로 재게시 폼이 Live 게시본의 일정·대상을 불러오지 않고 기본값(전체·무기한)으로 시작함 | `LaunchIntroAdminPage.tsx:376-381` | Live 게시본 값으로 폼 초기화 |
| B-3 | P1 | 업종 상단 배너 용량을 어드민에서 1~3으로 정할 수 있지만 앱은 1개만 그림(운영값이 모두 1이라 현재 피해 없음) | `StoresBrowseTopBanner.tsx:66` `banners[0]` | 어드민 최대값을 1로 하거나 앱이 용량만큼 그림 — **Owner 결정** |
| R-2 | P2 | PTR `landing_success` 를 실제 도착이 아니라 이동 명령 직후 기록함 | `DibayPtrRevealAdLayer.tsx:186-190` | 기록 시점을 경로 변경 뒤로, 또는 이벤트 이름을 「이동 시작」으로 |

## 3. Owner 결정 필요 — 계약 문서와 코드가 충돌 (규정 7: 임의로 고르지 않음)

| ID | 충돌 내용 | 정해 주실 것 |
|---|---|---|
| I-1·I-2 | 인트로 계약 2건(13차 SSOT, startup-config 「Web Intro = 0, 네이티브 오버레이만」)이 실제 구현(웹 오버레이 + 게시본/Live 포인터, 10-01)과 다름. 문서에 적힌 API 경로 `/api/intro/device/live` 등이 없음. 온라인이어도 새 게시본은 **다음** 콜드 스타트부터 나옴 | 현재 구현을 정본으로 하고 문서를 고칠지, 문서대로 구현을 바꿀지 |
| G-1·G-2·G-5 | 팝업 계약 lock(「오늘 하루 보지 않기」 기본, 닫기 = 이번만)과 나중 문서 promotion-program-ssot(× 하나, 닫으면 빈도 규칙 적용)가 충돌. 코드는 나중 문서를 따름. 그래서 어드민 「닫은 뒤 다시 안 보기」(TODAY/DURATION/CAMPAIGN)는 저장만 되고 효과가 없음 | 정본 문서 1개 지정. 효과 없는 어드민 입력 칸은 숨김 처리 |
| G-3 | 「전체」 팝업이 계약은 4개 영역인데, 코드는 어드민·배달 사장님 화면까지 6개 영역에 띄움 | 어드민·사장님 화면 포함 여부 |
| G-12 | 팝업에 화면에 보이는 「광고」 표기가 없음(aria 에만 있음). 인트로도 마찬가지 | 표기 필요 여부 |
| B-1 | 피드 배너 비율: 계약 §1 은 「카드 높이 리듬, 3:1 hero 아님」인데 코드는 3:1(09-19 커밋으로 복원) | 정본 비율 |
| B-2 | 배달 광고 SSOT §2 는 홈 중간·업종 상단을 FUTURE 로 적었지만 실제로는 운영 노출 중 | 문서를 현재 상태로 고쳐도 되는지 |
| P-1 | 상위노출 위치: 계약은 「page0 상단 고정, end_at 순」, 판매자 문구는 「목록 위쪽」인데 코드는 50칸 중 해시 위치에 1시간마다 순서 변경. 50번째 근처에 놓일 수도 있음 | 「위쪽」 범위(예: 1~N칸)와 정렬 규칙 |
| P-6 | 마스터 계약 「홍보」 배지·「광고라 부르지 말 것」 ↔ Owner 11-03 「광고」 칩 지시. 계약 「가격 원본 = 코드」 ↔ 현재 DB | 계약 문서 정정 승인 |

## 4. 완성도·SSOT 정리 (P2)

- **A-3**: 「광고 상품 / 가격」 화면이 상위노출 가격을 「코드 SSOT · 읽기 전용」이라고 표시하고 수정 링크가 없음. 실제 원본은 DB 이고 `/admin/trade-ad-policies` 에서 수정됨 (`lib/admin/ads-commercial/products-control-model.ts:257,305`)
- **A-4**: 같은 상품에 이름이 3~4개. canonical SSOT(`ads-canonical-product-ssot.ts`)를 상품 화면이 쓰지 않음. 「Community 상위노출」처럼 영문이 섞임. DB 에 오타 「플라이프 상단고정」
- **A-5**: 지면 한국어 이름이 4개 파일에 따로 있고 내용도 다름 → `human-placement-label` 하나로 통일
- **A-6·A-7**: 판매 안 하는 SEARCH_TOP 패키지 3행과 팝업 POPUP_7D 가 DB 에서 활성. 쓰이지 않는 `platform_ad_products`·가격 상수·카탈로그 함수가 남아 있음(DB 비활성화 = 별도 승인)
- **A-8**: `/admin/exposure-policies` 로 들어가는 메뉴가 없음
- **A-9**: 광고 내부 메모가 저장만 되고 어디에서도 보이지 않음(statement 의 `internalMemos` 는 항상 빈 배열)
- **A-10**: 결제·상태 enum 과 라벨 맵이 두 벌씩 있음
- **B-4**: 배달 홈 상단이 불러오는 동안 140px 빈 상자를 그렸다가 사라져 화면이 밀림(`StoresHomeHeroBanner.tsx:97-104`)
- **B-5**: 피드 배너 점의 화면낭독 문구가 영어 `slide N` 이고, 점(6px)이 작아 누르기 어려움(`FeedAdBannerCarousel.tsx:341`)
- **B-6**: 앱이 쓰지 않는 레거시 배너 위치 상수 5개(`banner-placements.ts`)
- **G-9·G-10**: 팝업 「오늘」 계산과 어드민 시작·종료 입력이 캠페인 시간대를 쓰지 않음(현재 운영 행은 모두 Manila 라 영향 없음)
- **G-11**: 팝업 모서리가 16px 고정. 계약은 폭 × 0.03(약 12px), 토큰은 정의만 있고 쓰이지 않음
- **G-13·P-7·B-7**: 기간 지난 `paused`/`active` 행이 그대로 남아 있음. 노출은 기간으로 걸러져 고객 영향은 없지만 어드민 목록 상태가 실제와 다름 → 표시할 때 「기간 만료」로 보여 줌
- **I-7·I-8·I-9**: 인트로 상태판 게시본 목록 20건 제한, 버려진 초안 업로드 파일이 지워지지 않음, 흰 배경 장면에서 CTA 글자가 안 보임
- **R-7**: PTR 띠 전체가 탭 영역이라 상태 문구를 눌러도 이동함
- **P-5**: 심사가 없는 거래 상위노출의 「신청」 큐 메뉴가 항상 비어 있음
- **R-4 (데이터)**: surface·exposureId 가 없는 PTR impression 1건 → 집계 제외(데이터 변경 = 별도 승인)

## 5. 코드 수준 PASS (요약)

- 상위노출: 서버 가격, 결제 시 가격 재확인, 중복 결제 방지, 본인 글·판매중만 결제, 만료 cron, 운영 종료 비례 환급, `/market` §9 불변조건 유지
- 팝업: 호스트는 셸당 1개, 렌더러 1개(미리보기 공용), 노출은 이미지 로드 후 기록, 무작위 없음, 가로 화면 제외, 메신저·통화·결제 경로 제외, CTA https·내부 경로 검증
- PTR: 광고가 새로고침을 막지 않음(유휴 시간 조회·4초 타임아웃·디코드 후 ready), 당기다 취소하면 노출 아님, 메신저 제외, 허용 목록 fail-closed
- 배너: 커뮤니티 위치 판정, 4~6개마다 결정적 간격, 「광고」 표기, 후보가 없으면 null, 배달 홈 상단 노출 자격 검사
- 인트로: 게시본 변경 불가, 낙관적 동시성 409, 마닐라 기준 일정·빈도, 사유 필수·감사 기록
- 어드민: 광고 메뉴 24개 경로에 모두 화면이 있음, 레거시 쓰기 API 410 차단, 워크스페이스 권한 강제

## 6. NOT_PROVEN (이번 감사로 판정 불가)

- Owner 계정·저장 주소·휴대폰에서 본 모든 화면. 특히 배달 샘플 배너 13건 노출, 팝업 높이·안전 영역, PTR 띠 렌더와 오탭
- 실기기 Android 뒤로가기와 팝업, I-4 스플래시 정지 여부
- 인트로가 사라지는 동안 팝업이 먼저 떠서 노출이 기록되는지
- main 신규 `plan-trade-grid-feed-ads`(거래 그리드 피드 광고 배치): 영역 감사가 로컬 브랜치 기준이었어서 깊게 보지 못함
- 커뮤니티 상위노출 만료 writer, Vercel cron 실행 기록, `trade_post_ads`·`post_ads` 운영 행
- Production SHA·배포 화면

## 7. 승인 요청 — 수정 계획 (승인된 단계만 진행)

| 단계 | 내용 | 분류 |
|---|---|---|
| **1단계** | P-2 · P-3 · A-1 · A-2 · R-1 · I-3 | 웹. 작업 브랜치 → 검증 → main 1회 |
| **2단계** | G-4 · G-6 · G-7 · G-8 · R-5 · R-6 · R-2 · I-5 · I-6 | 웹. I-4 는 시작 경로라 영향 분석 문서를 먼저 만든 뒤 따로 승인 |
| **3단계** | §3 Owner 결정이 나온 항목의 문서 정정 또는 코드 맞춤 | 결정 결과에 따라 다름 |
| **4단계** | §4 완성도·SSOT 정리 | 웹 |
| **DB** | P-4 함수 수정, A-6 패키지 비활성화, R-4 데이터 제외 | 운영 DB 적용 = 별도 승인 |

- 각 단계는 실기 확인 항목(Owner 휴대폰 기준)을 함께 적어 완료 보고합니다.

### 1단계 결과 (2026-11-03 · main `e85a05347` · 웹만)
- 반영: P-2 · P-3(판매완료 탭·가격 범위) · A-1 · A-2 · R-1 · I-3
- **정정 — P-3 설명**: 목록 함수 `trade_list_page` 는 필터에 맞지 않는 글을 빼지 않고 구간(가격 밖·지역 밖·판매완료)으로 **뒤에 둡니다**. 그래서 「필터 무시」는 맞지 않는 홍보 글이 1페이지 맨 앞 구간에 끼워지는 문제였습니다. 이번에는 판매완료 탭과 가격 범위만 맞췄습니다. **지역 구간·옵션(composition) 필터는 홍보 글에 적용하지 않았고 Owner 결정이 필요합니다.** 지역 구간 밖 홍보 글을 1페이지에 끼울지 여부입니다.
- **알림 — P-2**: 이전 동작(뽑히지 않은 홍보 글은 목록 어디에도 안 나옴)은 2026-08-20 구현 때 코드 주석과 테스트로 의도된 동작이었습니다. 계약 문서에는 그 조항이 없어서 승인안대로 바꿨고, 관련 테스트도 새 동작으로 고쳤습니다.
- A-1: 배너 상품 저장은 이제 사유를 입력해야 합니다(L2). 다른 관리자가 먼저 저장했으면 409 후 새 값을 다시 불러옵니다. `ads` 권한이 없는 관리자는 피드 배너 승인·반려·종료·중지와 상품 저장에서 403 을 받습니다.
- NOT_PROVEN: Production 화면·Owner 휴대폰 실기, 활성 상위노출 4건 이상인 실제 목록(운영 활성 주문 0건이라 재현 불가)

### 2단계 결과 (2026-11-03 · main `2674482d4` · 웹만)
- 반영: G-4 · G-6(CTA 경우) · G-7 · G-8 · R-2 · R-5 · R-6 · I-5 · I-6 · I-7(I-6 이 Live 게시본을 잃지 않으려면 필요해 함께 반영)
- 1단계 보정: 뒤 페이지에서 끼운 홍보 글을 서버가 다시 계산해 빼던 것을 없앴습니다. 시간 경계에서 글이 빠지던 경우와 추가 조회가 사라졌습니다. 거래 목록·카테고리 목록은 페이지를 붙일 때 id 로 중복을 거릅니다(`HomeProductList.tsx:829`, `PostListByCategory.tsx:505`).
- G-8 과 함께 고친 것:
  - 확인창이 열리면 팝업 surface 가 ORDER_CRITICAL 로 바뀌면서 「닫은 뒤 재노출 금지」 잠금이 풀렸습니다. 이 때문에 × 로 닫은 팝업이 확인창을 닫은 뒤 다시 뜰 수 있었습니다(고객센터 창도 같은 문제). 잠금은 이제 경로 기준 화면으로만 풉니다.
  - 팝업이 없는 화면에서 확인창을 열고 닫을 때마다 다시 조회하던 것도 멈췄습니다.
- R-2 정정: PTR 띠가 외부 주소를 `location.assign` 으로 열어 앱 화면 자체가 외부 사이트로 넘어갔습니다. 이제 팝업과 같은 `openDestination`(인앱 브라우저)을 씁니다. landing 기록은 「이동 시작 결과」이고, 실제 도착 측정은 계약에 없어 넣지 않았습니다.
- **Owner 결정 필요 — G-6 × 닫기**: `close_only` 팝업을 × 로 닫은 뒤 다른 화면으로 가면 다시 뜹니다. Owner FINAL(`dibay-promotion-program-ssot-lock.md` FREQUENCY_SSOT 「close_only = CLOSE only (no frequency suppress)」)과 계약 §6(연속 노출 금지)이 충돌해 바꾸지 않았습니다.
- **범위 밖 발견(보고만)**:
  - 전역 팝업 CTA 도 click·landing 기록을 동시에 보냅니다(`GlobalPopupHost.tsx` handleCta). 그래서 R-2 와 같은 순서 뒤바뀜이 생길 수 있습니다.
  - 인트로 이미지 업로드 실패는 아직 「오류: 원문」으로 표시됩니다(`LaunchIntroAdminPage.tsx` 업로드 처리).
- I-4: 영향 분석·수정 계획을 `docs/audit/launch-intro-i4-os-release-impact-2026-11-03.md` 에 적었습니다(승인 대기). Android·iOS 모두 웹 신호 말고는 시작 화면을 닫는 경로가 없는 것을 코드로 확인했습니다.
- NOT_PROVEN: Production 화면·Owner 휴대폰 실기 전부(운영에 노출 중인 팝업·PTR·인트로가 0건이라 운영 화면 재현 불가)

### I-4 결과·CI 정정 (2026-11-03 · main `335a9cdc5` · 웹만)
- **작업자 잘못 — main CI 실패**: 1단계 A-1(`e85a05347`)에서 피드 배너 신청 PATCH 권한 게이트를 바꿨습니다. 그런데 그 라우트 테스트(`app/api/admin/feed-ad-requests/[id]/__tests__/reject-atomic.route.test.ts`)를 돌리지 않아 8건이 500 으로 실패했습니다. 2단계 전체 테스트 실행 때도 실패 목록을 확인하지 않았습니다. `01bd5eae2` 로 테스트를 새 게이트에 맞추고, 권한 없음 → 403 테스트를 추가했습니다.
- **전체 vitest 확인**: 실패 7 파일(32건)은 작업 전 커밋 `92222cc30` 에서 같은 파일·같은 건수로 실패합니다(로컬 Node 26 localStorage 환경). 그 외는 전부 PASS 입니다.
- **I-4 (`335a9cdc5`)**: OS 해제 전 백그라운드·오류 종료 시 해제 권한을 커뮤니티로 넘깁니다. 설계는 `launch-intro-i4-os-release-impact-2026-11-03.md` 그대로입니다.
- NOT_PROVEN: CI 재실행 결과(조회하지 않음 — AGENTS.md 절대 금지 2), I-4 실기기(Live 인트로 없음 — 재현하려면 인트로를 Live 로 올리는 운영 설정 변경이 필요)

### 3단계 결과 (2026-11-03 · main `18dc95bf1` · 웹만)
- **반영**: 권장안 `ads-stage3-recommendations-2026-11-03.md` 그대로.
  - 코드: P-1 · P-3 · G-3 · G-5 · G-6 · G-12 · B-3
  - 문서: I-1·I-2 · 팝업 lock 2 · 프로그램 SSOT · B-1 · B-2 · P-6
- **1단계 누락 보정**: P-3 판매완료·가격 조건이 `/api/trade/feed`(시장 첫 화면 bootstrap) 경로에는 빠져 있었습니다. 검색어가 있을 때도 그 경로는 상위노출을 끼웠습니다. 이번에 목록 API 와 같은 조건으로 맞췄습니다.
- **작업 중 되돌린 것(B-3)**: 처음에는 SSOT `STORES_CATEGORY_TOP.max` 를 1로 바꿨습니다. 그런데 이 값이 어드민 등록·승인 수용량 검사(`capacity-gate.ts:309`)에도 쓰여, 같은 기간 예비 배너 등록을 막게 되는 것을 확인했습니다. 그래서 SSOT 는 3 그대로 되돌리고, 화면 표시 수만 1로 고정했습니다(`STAGE2_BROWSE_BANNER_VISIBLE_COUNT`).
- **P-3 구간 계산**: TS `tradeListLocationTier` 가 운영 DB `trade_list_page` 의 lgu·legacy·default·hood 규칙과 같은지 운영 함수 본문 조회로 대조했습니다.
- **검증**:
  - typecheck:build·typecheck:test PASS. 관리자 문구 카탈로그는 타입 크기 한도에 걸려 키를 늘리지 않았습니다.
  - eslint 오류 0, verify 3종 PASS.
  - vitest 전체: 실패 7 파일·32건은 작업 전 `92222cc30` 과 같습니다.
- **별도 승인 대기**: 광고 신고 기능(Apple 2.5.18), iOS 인앱결제 대응(Apple 3.1.3(g)), 4단계 완성도 정리, DB 3건(P-4·A-6·R-4).
- **NOT_PROVEN**:
  - Production 화면·Owner 휴대폰 실기.
  - 팝업 「광고」 표기 실제 모양(특히 투명 배경 아트워크 위).
  - 상위노출 위쪽 배치·지역 조건 실제 목록(운영 활성 상위노출 0건).

### 4단계 결과 (2026-11-03 · main `e82ae3c63` · 웹만)
- **반영**: A-3 · A-4 · A-5 · A-7 · A-8(안내) · A-9 · B-4 · B-5 · B-6 · G-9 · G-10 · G-11 · G-13 · I-8 · I-9 · P-5
- **범위 밖 발견 2건도 처리**:
  - 팝업 CTA 의 click→landing 기록 순서와 연타 1회 처리
  - 인트로 업로드 오류 한국어 문구
- **바꾸지 않은 것과 근거**:
  - A-10: `post_ads` 와 광고 신청은 서로 다른 테이블 타입이고, `post-ad-application-adapter.ts` 로 의도해서 변환한다.
  - P-7: 어드민 피드 배너 목록·컨트롤 플레인은 이미 기간 기준으로 「종료」를 표시한다(`project-family-rows.ts:407`, `AdminFeedAdsListPage.tsx:63`).
  - R-7: 팝업 계약 §7 이 「소재 전체 탭」을 허용한다.
  - A-6·R-4·P-4: 운영 DB 변경이라 별도 승인 대상.
- **작업 중 바꾼 판단**:
  - P-5: 처음에는 메뉴를 지우려 했다. 그런데 CUT J hard lock(J-AMD-5 「옛 메뉴 경로는 활성 메뉴로 열려야 함」) 위반이라 되돌렸다. 대신 화면을 「주문 내역 조회 + 관리 링크」로 바꾸고, 「승인/반려」라고 잘못 적힌 안내도 정정했다.
  - A-8: 노출정책 값이 앱 정렬에 쓰이지 않는 것을 확인했다(앱은 `getDefaultExposureScorePolicyBySurface` 사용). 효과 없는 화면을 메뉴에 올리지 않고, 화면에 확정 안내만 넣었다.
  - G-11: 감사의 「폭×0.03」 근거는 9월 geometry lock 이었다. 프로젝트 오버레이 계약(AGENTS.md 12~24px)이 우선이라 16px 을 유지하고 토큰만 정리했다(화면 변화 없음).
- **I-8 범위**: 저장 때 이전 초안에서 빠진 업로드만 지운다. 저장한 적 없는 업로드는 다른 관리자가 저장하기 직전일 수 있어 지우지 않는다. 운영 비공개 버킷에 이미 남아 있는 미참조 객체 2개를 지우는 것은 운영 데이터 변경이라 별도 승인 대상이다.
- **검증**:
  - typecheck 2종 PASS, eslint 오류 0.
  - verify 5종 PASS(trade-hot-path·cut-a·cut-c·cut-f·cut-j).
  - vitest 전체: 실패 7 파일·32건은 작업 전 `92222cc30` 과 같다.
- **NOT_PROVEN**:
  - Production 화면·Owner 휴대폰 실기.
  - 배너 점 누르기 영역, 인트로 CTA 대비의 실제 모양.
  - 어드민 메모 목록 화면.

### DB 3건 결과 (2026-11-03 · 운영 적용 08:39 UTC = 16:39 PHT · main `0a1bdf964`)
- **P-4 적용**: `purchase_member_content_promotion` 중복 확인 = `order_status IN ('active','paused')`.
  - 방법: 운영 정의에서 바꿀 줄이 1번만 있는 것을 먼저 확인하고, 그 줄만 바꿨다.
  - 적용 후 확인: SECURITY DEFINER 유지, 실행 권한 postgres·service_role, 「거래 상위노출 N일」 문구 유지.
  - 적용 시점 일시정지 주문은 0건이었다.
- **A-6 일부 적용**: `STORES_SEARCH_TOP` 패키지 3개 `enabled=false`.
  - 다른 배달 패키지 9개는 켜진 그대로다.
  - **POPUP_7D 는 바꾸지 않았다(Owner 결정 필요)**: 기존 사장님 팝업 신청 초안 9건(draft/unfunded 5 · draft/failed 4)이 있다. 패키지를 끄면 그 초안에서 패키지를 고를 때 `package_inactive` 로 막힌다(`owner-request-writer.ts:233-235`). D-5 결정에는 「기존 신청 보기 유지」만 있고, 초안을 마저 내도 되는지는 적혀 있지 않다.
- **R-4 적용**: 수동 입력 impression 1건 삭제. 적용 후 surface 없는 impression 은 0건이다. QA 캠페인 집계는 impression 27·click 5·landing 5·dismiss 22.
- **백업·되돌리기 SQL**: `docs/audit/ads-db-changes-backup-2026-11-03.json`
- **migration 기록**: 운영 버전은 `20261103083937 ads_audit_db_fixes`(도구가 적용 시각으로 기록), 저장소 파일은 `20271103210000_ads_audit_db_fixes.sql`. 저장소 파일 이름과 운영 버전이 다른 것은 기존 마이그레이션들과 같은 상태다.
- **NOT_PROVEN**: 일시정지 주문이 있는 글에 실제로 결제를 시도해 보는 확인(운영 일시정지 주문 0건이라 재현 불가).
- 통화·메신저 코드는 건드리지 않습니다.
