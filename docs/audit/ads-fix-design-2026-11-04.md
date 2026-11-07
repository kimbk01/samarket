# 광고 ② 수정 설계안 (최종 구현 승인 요청 · 2026-11-04 PHT)

> 근거: 명세 `ads-screen-behavior-spec-2026-11-04.md`(§1 「다름」 46 · 「확인 못 함」 22 · §3 Owner 결정 결과). 기준 코드 main `5b832c7d4`.
> 이번 단계에서는 **코드 수정·운영 DB 변경·main·배포·네이티브·실기를 하지 않았다.** 운영 DB 는 읽지도 않았다(코드·마이그레이션 파일과 공개 문서만 봤다).
> Owner 지시(11-04): 「레거시 어플 등의 기준을 참조해서 진행해야 한다. 분석 없이 구현하지 마라」 → §1 에 외부 기준을 먼저 정리했다. 항목마다 「기준」 칸이 있다.
> 판정 표기:
> - 코드 확인 = 이번에 파일을 열어 본 것
> - 근거(F) = 오늘 공식 문서를 직접 열어 본 것
> - 근거(2차) = 대행사·기사 글이라 공식 확인이 아닌 것
> - NOT_PROVEN = 확인 못 함

---

## 0. 먼저 보고 (작업자가 찾은 위험 · 범위 밖은 보고만)

| # | 내용 | 근거 | 처리 |
|---|---|---|---|
| R-A | **앱 심사 위험 (범위 밖 · 큼)**. 포인트는 은행 송금·GCash 로 충전한다(`lib/types/point.ts` `bank_transfer·gcash·manual_confirm`). 그 포인트로 거래·커뮤니티 글 상위노출을 산다. Apple 3.1.3(g)는 「소셜 앱에서 글 부스트 판매」를 예로 들어 앱 안 광고 구매는 인앱결제를 써야 한다고 적는다. Google Play 결제 정책 §2 도 앱 안 가상 화폐(virtual currencies)를 Play 결제 대상으로 든다 | 근거(F) Apple App Review Guidelines 3.1.3(g) · 근거(F) Google Play Payments 정책 §2·§4 · 코드 확인 | 광고 수정 범위 밖이다. 고치지 않고 **Owner 결정 필요**로 올린다. 매장(배달) 광고의 비즈니스 캐시는 실물 서비스 사업자용이라 같은 판정인지는 확인 못 함 |
| R-B | **팝업 기록 API 무제한 쓰기**. `app/api/platform-popup/events/route.ts` 와 `suppress/route.ts` 는 비로그인이면 기기가 보낸 `deviceKey` 만으로 행을 넣는다. 요청 제한이 없고 중복 거르기도 없다. 키를 바꿔 보내면 노출 숫자를 부풀릴 수 있고 표가 계속 커진다 | 코드 확인 | D-21 조건대로 최소 장치를 넣는다(§4 D-21) |
| R-C | **D-30 근거 결과**: 「포인트 노출」은 Owner 확정(11-04)이다. 다만 외부 기준은 모두 **돈을 낸 노출에 「광고·Sponsored·Promoted」 같은 표시**를 요구하거나 그렇게 한다 (§1 표 L-1~L-4). 「포인트 노출」이 「돈을 내고 올린 글」로 읽히는지는 근거가 없다 | 근거(F)·근거(2차) | 규정 7(충돌 보고). Owner 결정은 바꾸지 않는다. 위험만 기록한다(§4 D-30) |
| R-D | 이전 보고 정정 없음. FB-M13 은 명세 §0 에 보고한 그대로다. 이번에 서버를 다시 확인했다. 연장 서버는 같은 키면 처음 결과를 돌려준다(`renew-feed-ad-campaign.ts:33-38,150,201-206`). 그래서 **고칠 곳은 화면 키 하나**다 | 코드 확인 | §2 |

---

## 1. 외부 기준 (레거시 앱·플랫폼 규정) — 설계의 기준점

| ID | 주제 | 외부 기준 | 근거 | 지금 DIBAY | 설계 반영 |
|---|---|---|---|---|---|
| L-1 | 앱 안 광고 표시 | Google Play: 광고가 앱 기능 UI 를 흉내 내면 안 되고, 어느 앱이 광고를 띄우는지 분명해야 한다 | 근거(F) Play 「Ads」 정책 Deceptive Ads | 피드·배달 배너 「광고」 표시 있음 | 유지 |
| L-2 | 끼어드는 광고 | Apple 2.5.18: 화면을 가리는 광고는 광고임을 분명히 표시하고, 보이고 충분히 큰 닫기 버튼을 둔다. 누르게 속이면 안 된다. Google: 전체 화면 광고가 예고 없이 뜨면 안 되고, 15초 뒤에도 못 닫으면 안 된다 | 근거(F) Apple 2.5.18 · Play Better Ads Experiences | 팝업 = 「광고」 표시 + × 버튼(명세 PU 표) | 팝업·인트로 「닫기 즉시 가능」 유지. PTR 띠 전체 탭(PT-07)은 「속여 누르게 함」 위험이 있다 → D-1 로 CTA 만 누르게 바꾼다 |
| L-3 | 피드 안 네이티브 광고 | Google Play 는 피드 안 광고를 「네이티브 광고」로 Play Console 에 신고하게 한다. Meta Audience Network 는 「Sponsored·Promoted·Ad」 표시를 요구한다 | 근거(2차) Play 네이티브 광고 신고 안내 · Meta AN 정책 | 피드 배너 「광고」 · 커뮤니티 상위노출 「포인트 노출」 | 피드 배너 유지. 커뮤니티는 R-C |
| L-4 | 경제적 이해관계 표시 위치 | 한국 공정위 「추천·보증 심사지침」 개정(2024-12-01 시행): 표시 문구를 **제목 또는 첫 부분**에 두고 알아보기 쉽게 한다 | 근거(2차) 신&김 뉴스레터·보도 | 「광고」 칩이 카드 머리에 있음 | 칩 위치 유지(첫 부분). 필리핀 ASC 규정의 같은 조항은 찾지 못함 = NOT_PROVEN |
| L-5 | 당근 피드 광고 | 중고 글 사이에 끼우고 「광고」 식별 문구를 붙인다. 동 단위 지역 타깃이다 | 근거(2차) 대행사 글 | 피드 배너 4~6 간격 · 「광고」 | D-11(동네 탭 그 동네만)·D-23 과 같은 방향 |
| L-6 | 결제 재시도 | Stripe: 연결이 끊긴 뒤 **같은 키로 다시 보내면** 두 번 처리되지 않는다. 키는 무작위(UUID v4), 요청 내용이 다르면 오류 | 근거(F) Stripe Idempotent requests | 서버는 같은 키면 처음 결과를 돌려준다. 피드 연장 화면만 누를 때마다 새 키를 만든다 | FB-M13: 「한 결제 시도 = 키 1개, 확정 응답 전까지 유지」 |
| L-7 | 노출 1회 정의 | MRC/IAB: 화면에 **픽셀 50% 이상이 1초 이상 연속** 보여야 노출 1회 | 근거(F·검색 요약) MRC Viewable Impression Guideline v2.0 | 피드 배너 = 50% · 1000ms(`feed-ad-event-client.ts:8-9`) → **같음** | 피드 유지. 팝업·PTR·배달 노출 정의는 이번에 대조 안 함 = NOT_PROVEN (범위 확대 안 함) |
| L-8 | 광고 숫자 부풀리기 | Apple 3.2.2(iii): 노출·클릭을 인위로 늘리는 것을 금지한다 | 근거(F) | 피드 = 1인·1소재·1시간 1회 · 팝업 = 거르기 없음(R-B) | D-21 |
| L-9 | 부분 환급 | 외부 공개 기준은 찾지 못했다 | NOT_PROVEN | 상위노출 운영 귀책 = 남은 비율 환급(`admin_promotion_end`) | 기존 내부 규칙을 피드(D-5)·배달(D-13)에 같게 쓴다 |

---

## 2. P0 — FB-M13 피드 배너 연장 재시도 두 번 차감 (맨 먼저)

| 칸 | 내용 |
|---|---|
| 원인 | `app/(main)/mypage/ads/MyAdsPageClient.tsx:315-318` 이 「연장」을 누를 때마다 `crypto.randomUUID()` 를 만든다. 응답이 끊겨 다시 누르면 서버는 다른 결제로 보고 한 번 더 차감·연장한다. 서버의 같은 키 처리(`renew-feed-ad-campaign.ts:33-38,150,201-206`)는 이미 있다 |
| 기준 | L-6 (Stripe: 재시도는 같은 키) |
| 수정 | 앞서 고친 4개 결제 화면과 같은 모듈 `lib/points/promotion-attempt-key.ts` 의 `createPromotionAttemptKeyStore` 를 쓴다. 대상 = `campaignId`, 상품 = `renewProductId`.<br>① 누를 때 `keyFor(campaignId, productId)` 로 키를 받는다<br>② 응답이 2xx·4xx 면 `settleIfFinal(status)` 로 키를 버린다. 끊김·5xx 면 키를 남긴다<br>③ 키가 남아 있으면 연장 창이 그 상품을 다시 고른다(`pendingProductFor`)<br>④ 409 `idempotency_consumed` 는 「이미 처리된 연장입니다」로 안내하고 목록을 다시 불러온다 |
| 파일 | `app/(main)/mypage/ads/MyAdsPageClient.tsx` (1곳) |
| DB | 없음 |
| 영향 화면 | 마이 › 광고 › 피드 배너 연장 창만 |
| 회귀 위험 | 키를 남겨 둔 채 다른 상품을 고르면 처음 상품으로 처리된다. 4개 화면과 같은 동작이고, ③ 이 화면에도 보인다 |
| 시험 (코드) | jsdom 동작 시험. 첫 요청 끊김 → 다시 누름 → **두 요청의 키가 같다** · 2xx 뒤 새 연장은 키가 다르다 · 5xx 뒤 같은 키. 옛 코드에서 실패하고 새 코드에서 통과하는지 확인한다 |
| 시험 (운영 DB) | 롤백 시험 1회. 같은 키로 연장 2번 → 차감 1행 · `end_at` 1번만 늘어남 · 끝에 `RAISE EXCEPTION` 으로 되돌림 |
| 남은 위험 | 키는 화면 메모리에만 둔다. 앱을 새로 띄운 뒤 다시 결제하면 새 결제다. 4개 화면과 같고, 연장된 종료일이 화면에 보이므로 회원이 알 수 있다 |

---

## 3. 「다름」 46건 — 하나씩 수정 여부

열: 결정(수정 / 문서 정정 / 수정 안 함) · 설계 · 파일 · DB · 회귀 위험 · 시험.
「묶음」 A = 웹(main 1회) · B = 운영 DB(별도 승인) · C = 앱 시작 경로(영향 분석 포함, A 안에서 단독 커밋).

### 3-1. 상위노출 (PB · 8건)

| ID | 결정 | 설계 | 파일 | DB | 회귀 위험 | 시험 | 묶음 |
|---|---|---|---|---|---|---|---|
| PB-9 | 수정 | 카테고리 첫 화면도 목록 API 와 같은 동네 조건을 넘긴다(D-11 방향과 같음). 주석의 「의도적으로 null」은 지운다 | `lib/posts/resolve-trade-feed-open-payload.ts:131-138` | 없음 | 거래 hot path. `getPostsForHome` 한 번만 부르기·prewarm 키 일치(`TRADE_HOME_LIST_INVARIANT_IDS`)를 깰 수 있다 → 키에 동네 값을 넣으면 prewarm 쪽도 같이 바꾼다 | 라우트 시험(같은 동네 조건) + `verify:trade-hot-path` | A |
| PB-10 | 수정 | 서버 첫 화면 시드에 `lguCityId` 를 넘겨 목록 API 와 같게 한다 | `lib/market/load-market-bootstrap-payload.ts:155-164` | 없음 | PB-9 와 같음. 시드와 첫 요청의 결과가 같아야 깜빡임이 없다 | 시드·API 결과 같음 시험 | A |
| PB-21 | 수정 | 20개 상한을 없앤다. 「광고 중인 글 id 전체」를 가볍게(id·결제 시각만) 받아 위쪽 3개 + 일반 자리 표시에 쓴다. 상한은 안전값 500(초과하면 기록) | `lib/promotion/community-paid-exposure-feed.ts:39` · `app/api/ads/active/route.ts:27-29` | 없음 | 응답이 커진다. 위쪽 3개만 카드 값(feedPost)을 붙이고, 나머지는 id 만 보낸다 | 21개 광고 → 21번째도 배경·「포인트 노출」 | A |
| PB-22 | 수정 | 운영 고정 카드도 광고 id 집합에 있으면 `isAd` 를 준다 | `components/community/CommunityFeed.tsx:2005-2008` | 없음 | 운영 고정 표시와 배경이 겹친다. 운영 고정 칩 + 「포인트 노출」 두 개를 함께 둔다(색이 아니라 글자로 구분) | 렌더 시험 | A |
| PB-26 | 수정 | 시각을 D-12 형식(PHT 「11월 6일 18:00」)으로 바꾼다. 형식 함수 **1개**를 새로 둔다. 기존 `formatManilaDateTime`(정산 · `YYYY-MM-DD HH:mm`)은 형식이 달라 그대로 둔다 | `TradeAdQuickSheet.tsx:296-302` · 새 `lib/time/format-pht-display.ts` | 없음 | 영어 화면 형식: 「Nov 6, 18:00」 | 시간대가 다른 기기를 흉내 내도 같은 문자열이 나온다 | A |
| PB-29 | 수정 | 같은 함수 사용 | `components/post/MemberPostPromoteSheet.tsx:343,378,415,435` | 없음 | 같음 | 같음 | A |
| PB-39 | 수정(잠복) | 거래 결제 함수의 중복 검사에 `pending_review` 를 더한다(커뮤니티와 같게) | 새 마이그레이션: `purchase_member_content_promotion_v2` 교체 | **있음** | 지금 승인형 상품은 0개라 동작 변화 없음 | 운영 롤백 시험(심사 중 주문 → 409) | B |
| PB-40 | 수정 | 커뮤니티 결제 함수가 상품 가격을 **함수 안에서 다시 읽고 잠근다**(`for share`). 넘어온 값과 다르면 `price_changed` 를 낸다 | 새 마이그레이션: `purchase_member_community_promotion` · `lib/promotion/apply-community-paid-exposure.ts:196-208` | **있음** | 앞단 비교(`route.ts:226`)와 오류 이름을 같게 해야 화면 안내가 유지된다 | 롤백 시험(가격 바꾼 뒤 옛 가격 결제 → 거절·차감 0) | B |
| PB-54 · AD-126 | 수정 | 저장 버튼 `disabled` 에 권한 조건을 더한다. 권한이 없으면 사유 창을 열기 **전**에 막고 안내한다(AD-204 공통 규칙) | `AdminMemberPromotionProductsPage.tsx:191,235` | 없음 | 없음 | 권한 없는 계정 렌더 시험 | A |

### 3-2. 피드 배너 (FB · 12건)

| ID | 결정 | 설계 | 파일 | DB | 회귀 위험 | 시험 | 묶음 |
|---|---|---|---|---|---|---|---|
| FB-M13 | 수정 | §2 | §2 | 없음 | §2 | §2 | A |
| FB-C07 | 문서 정정 + 시험 (D-23) | 계약을 「4~6 이후 **줄이 끝나는 첫 자리**」로 고친다. 코드는 그대로 둔다. **D-23 조건**: 샘플 카드(1칸)가 섞여도 「글 수 기준 간격 ≥ gap · 줄 첫 칸」 규칙이 지켜지는지 시험을 더한다. 시험에서 규칙과 다른 위치가 나오면 그때 고친다(지금은 결함으로 보지 않음) | `lib/trade/marketplace/plan-trade-grid-feed-ads.ts` 시험 · HL 계약 문서 | 없음 | 없음 | 샘플 0·1·2개 × gap 4·5·6 × 글 30개 표 시험. 모든 광고가 줄 첫 칸이고, 앞 광고 뒤 글 수 ≥ gap 인지 본다 | A |
| FB-C17 | 수정 | ① 이름을 비우면 「Untitled」 대신 null 로 저장 ② 표시 함수가 null·「Untitled」를 거르고 광고주 이름 없이 「광고」만 보인다 ③ 회원 광고는 **보는 시점의 닉네임**을 붙인다(승인 시 복사 대신 조회 때 조인) | `app/api/admin/feed-ads/route.ts:111` · `lib/ads/update-feed-ad-campaign.ts:50` · `lib/ads/feed-ad-advertiser-name.ts:11-15` · `approve-feed-ad-request.ts:161-162` | 운영의 「Untitled」 행 정리 = 데이터 변경 | ③ 피드 응답에 조인이 하나 는다. 같은 쿼리 안에서 처리한다 | 표시 함수 단위 시험 · 닉네임 변경 반영 시험 | A (+ 데이터 정리는 B) |
| FB-M06 | 수정 | 회원 직접 INSERT 정책 `feed_ad_requests_insert_own` 을 지운다. 신청은 서버 경로(service role)만 만든다 | 새 마이그레이션 | **있음** | 클라이언트가 직접 넣는 곳이 있으면 깨진다 → 구현 전 `from("feed_ad_requests").insert` 를 전수 grep(서버 파일만 있어야 함) | 롤백 시험: authenticated 역할 INSERT → 거부 | B |
| FB-M11 | 수정 | 캠페인에 `paused_by`(`admin`·`member`·`system`)와 `paused_at` 칸을 둔다. 「paused = 관리자」 추정을 지운다. D-5 재개 연장에도 쓴다 | 마이그레이션 · `lib/ads/feed-ad-member-presentation.ts:257-261` · `pause-resume-feed-ad-campaign.ts` | **있음**(칸 추가 · 기존 paused 행은 `admin` 으로 채움) | 칸이 없을 때 웹이 먼저 배포되면 깨진다 → B 를 먼저 적용 | 렌더 시험(관리자 정지 문구) + 롤백 시험 | B → A |
| FB-P09 | 수정 | 동시 승인에서 진 쪽은 **보류 포인트를 돌려주지 않고** 「검토 중」으로 되돌린다. 다시 승인할 수 있고(`hold_missing` 500 없음), 반려하면 그때 환급한다. 화면에는 「자리가 차서 승인되지 않았습니다」를 보인다 | `lib/ads/approve-feed-ad-request.ts:245-251` | 없음(기존 함수 순서만 바뀜) | 보류가 남은 채 오래 검토 중일 수 있다 → 어드민 신청 목록에 「자리 없음 대기」 표시 | 동시 승인 2건 시험: 이긴 쪽 차감 1 · 진 쪽 보류 유지 · 재승인 성공 · 원장 합계 = 0 차이 | A |
| FB-E07 | 수정 | 기록 API 가 소재 id 없는 요청과 목록에 없는 위치 값을 **400** 으로 거른다. DB 함수에도 같은 검사를 넣는다(키 `'-'` 행 금지) | `app/api/feed-ads/events/route.ts:50` · `record_feed_ad_event` | **있음**(함수 교체) | 구 앱이 소재 id 없이 보내는 경로가 있으면 그 기록이 빠진다 → 구현 전 호출처 grep | 라우트 시험 400 · 롤백 시험 | A + B |
| FB-A05 | 수정 | 피드 배너 정지·재개도 **사유 필수**(Owner 결정 1). 도메인 PATCH 필수 목록과 허브 필수 목록에 pause·resume 을 넣는다. 빈 사유를 코드값 `"admin_paused"` 로 바꿔 저장하는 것은 지운다 | `feed-ad-requests/[id]/route.ts:294` · `advertising-workspace/action/route.ts:130-135` · `pause-resume-feed-ad-campaign.ts:88` · 확인창 문구 `admin-mutation-confirm-copy.ts` | 없음 | 단계가 L1 → L2 로 바뀐다. 두 화면이 같은 단계를 쓰는지 시험한다 | 사유 없이 정지 → 400 · 두 화면 같은 단계 | A |
| FB-A06 · AD-207 | 수정 | 조치마다 사유를 **덮어쓰지 않고 쌓는다**(이력은 감사 표). 감사에 `before_json`(조치 전 상태·기간·사유)을 남긴다 | `action/route.ts:270,314-319` · `feed-ad-requests/[id]/route.ts` · `lib/admin/audit/append-admin-route-audit` 호출처 | 없음 | 감사 행이 조금 커진다 | 감사 시험: before·after 둘 다 있음 | A |
| FB-A07 · AD-110 · AD-111 · AD-206 | 수정 | 감사 이름을 하나로 정한다: `feed_ad_request.approve` · `feed_ad_request.extend_compensation`(도메인 이름 기준). 허브도 같은 이름을 쓴다. 운영 DB 의 옛 이름 행은 0건(명세 AD-206)이라 이력 변환은 필요 없다 | `action/route.ts:208,269` | 없음 | 이력 화면이 이름으로 거르면 같이 바꾼다 → `project-history-timeline.ts` grep | 감사 이름 시험 | A |
| FB-A10 | 수정 | 보상 연장·수정에서 트리거의 자리 없음 오류(`feed_ad_pool_capacity_full`)를 잡아 409 + 「자리가 없어 처리하지 못했습니다」로 바꾼다(다른 경로와 같은 변환 함수) | `admin-compensate-extend-feed-ad-campaign.ts:80` · `update-feed-ad-campaign.ts:104` | 없음 | 없음 | 오류 변환 시험 | A |
| FB-A11 | 수정 | 위치 지도도 「위치 + 업종/주제」 키로 센다(등록 화면·트리거와 같은 함수) | `lib/admin/ads-exposure/placement-inventory.ts:205-221` | 없음 | 지도 칸 수가 늘어난다. 칸 안에 업종별 줄을 보인다 | 같은 입력에서 세 곳의 숫자가 같다 | A |
| FB-A15 | 수정 | 이벤트 배너를 고치면 피드 소재(이미지·제목·목적지)도 같이 고친다. 이미지가 바뀌면 새 소재 행 + 옛 행 비활성(노출 기록 보존) | `lib/platform-promotion-distribution/save-event-distribution.ts:236-263` | 없음 | 이벤트 배너를 고치면 노출 숫자가 새 소재로 나뉜다(D-25 「소재별 합」으로 합계 유지) | 수정 후 피드 응답 이미지 = 새 이미지 | A |

### 3-3. 팝업·PTR (PU·PT · 6건)

| ID | 결정 | 설계 | 파일 | DB | 회귀 위험 | 시험 | 묶음 |
|---|---|---|---|---|---|---|---|
| PT-07 | 수정 (D-1) | 띠 전체 `inset-0` 버튼을 없앤다. **CTA 칩만** 버튼으로 하고, 최소 44×44pt 를 지킨다(Apple HIG 터치 크기 · L-2 「속여 누르게 하지 않음」) | `components/ptr/DibayPtrRevealBand.tsx:104-112` · `DibayPtrRevealAdLayer.tsx` | 없음 | 클릭 수가 줄어든다(의도). 당겨서 새로고침 제스처와 겹치지 않는지 실기로 본다 | 렌더 시험(버튼 1개) · 실기 | A |
| PU-13 | 수정 | `TradeChatEntryCreatingOverlay`·`OAuthProviderLoginPanel` 에 `useRegisterOpenOverlay` 를 단다 | 두 컴포넌트 | 없음 | 없음 | 열림 중 팝업 보류 시험 | A |
| PU-30 | 수정 | CTA 로 끝나면 click → landing 만 남기고 dismiss·suppress 는 남기지 않는다 | `GlobalPopupHost.tsx:435-446,500-544` | 없음 | CTA 뒤 같은 날 다시 뜨는지 확인 필요 → 「오늘 하루」 숨김은 사용자가 고른 경우만이므로 CTA 뒤에는 세션 숨김(메모리)만 둔다 | 이벤트 순서 시험 | A |
| PU-31 | 수정 (D-21) | 효과 없는 CLOSE(×) 는 DB 행을 쓰지 않는다. 세션 숨김만 둔다 | `GlobalPopupHost.tsx:448-461` | 없음 | 없음 | ×  → 요청 0 시험 | A |
| PU-39 | 수정(잠복) | 사장님 팝업 승인에서 **검증을 캠페인 생성 앞으로** 옮기고, 생성·상태 변경을 한 함수(트랜잭션)로 묶는다 | `lib/platform-popup/owner-request-approve.ts:180-199` | 판매 꺼짐(`OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED=false`)이라 코드 순서만 바꾼다. DB 함수는 판매를 켤 때 따로 | 없음 | 검증 실패 → 캠페인 0 시험 | A |
| PT-22 | 수정 | 안내를 「영역 지정 > 우선순위(높을수록 먼저) > 덜 본 것」으로 고친다 | `AdminPtrRevealDetailWorkspace.tsx:354` | 없음 | 없음 | 문구 시험 | A |

### 3-4. 배달·마이 배너·인트로 (DB·MB·IN · 6건)

| ID | 결정 | 설계 | 파일 | DB | 회귀 위험 | 시험 | 묶음 |
|---|---|---|---|---|---|---|---|
| DB-C07 | **수정 보류 → 실기 측정** | 서버 HTML 첫 그림에 140px 상자가 들어가는 것은 코드로 맞다. 다만 web.dev CLS 기준상 **내용이 올 자리는 미리 잡는 것이 권장**이다. 배너가 있으면 지금이 맞고, 없을 때만 밀림이 생긴다. 실제로 보이는지가 NOT_PROVEN 이라 지금 고치지 않는다. 실기 V-15 에서 콜드 스타트로 잰 뒤, 보이면 설계안을 따로 올린다 | `StoresHomeHeroBanner.tsx:57-60,134-148` | 없음 | — | 실기 V-15 | — |
| MB-C04 | 수정 | 고객 조회 정렬을 어드민과 같게 `priority → sort_order → created_at desc` 로 바꾼다 | `mypage-summary.server.ts:94` | 없음 | 운영 QA 2건 순서가 바뀔 수 있다(지금도 정해지지 않은 상태) | 정렬 시험 | A |
| MB-A01 | 수정 | 시작 전이면 「예정」으로 보인다 | `admin-banner-utils.ts:24-31` | 없음 | 없음 | 상태 함수 시험 | A |
| MB-A03 | 수정 | 공통 화면 숫자도 고객 조회와 같은 조건(`is_active` · 종료 순간 제외)을 쓴다. 조건은 함수 1개로 묶어 두 곳이 같이 쓴다 | `app/api/admin/advertising/other-surfaces/route.ts:31-35` · `mypage-summary.server.ts` | 없음 | 없음 | 경계 시각 시험 | A |
| IN-S10 | 수정 (D-17) | §5 영향 분석 | `LaunchIntroRoot.tsx:241-250` | 없음 | §5 | §5 | C |
| IN-S11 | 수정 (D-16·D-17) | §5 영향 분석 | `LaunchIntroRoot.tsx:77-150` | 없음 | §5 | §5 | C |
| IN-P10 | 수정 | Live 게시본이 손상되면 500 대신 「게시 안 됨」(인트로 없음) 상태를 돌려준다. 기기는 인트로를 끈다(실패 시 닫힘 쪽으로) | `server.ts:189-191` · `live/route.ts:37` · `discovery.ts:54` | 없음 | 손상 시 인트로가 안 나온다. 이게 의도다(앱 시작을 막지 않음) | 손상 문서 → 200 unpublished 시험 | C |
| IN-A05 | 수정 | 검사 코드(`scene_empty` 등)를 한국어 문구로 바꾸는 표를 둔다. 표에 없는 코드는 「게시본 형식 오류」 | `LaunchIntroAdminPage.tsx:1161-1185` · i18n `:99` | 없음 | 없음 | 문구 시험 | A |

### 3-5. 어드민 공통 (AD · 14건 · 위 FB-A·PB-54 와 겹치는 6건 제외 8건)

| ID | 결정 | 설계 | 파일 | DB | 회귀 위험 | 시험 | 묶음 |
|---|---|---|---|---|---|---|---|
| AD-009 · AD-304 | 수정 | 커뮤니티 구역 제목 「홍보」 → 「상위노출」. 알림 항목 이름 「커뮤니티 홍보 종료」「거래글 홍보 심사」도 같이(PB-58) | `lib/i18n/catalog/admin-community-r4.ts:16` · 알림 문구 카탈로그 | 없음 | 메뉴 이름 계약 시험이 있으면 같이 고친다 | 문구 시험 · `verify:*` 메뉴 계약 | A |
| AD-103 | 수정 | 팝업 재개는 어디서나 **L2(사유 필수)** 로 맞춘다(Owner 결정 1 「사유 보존」 · FB-A05 와 같은 방향) | `admin-mutation-confirm-copy.ts:58-62` | 없음 | 공통 화면에서 재개 클릭이 한 단계 늘어난다 | 두 화면 단계 같음 시험 | A |
| AD-123 | 수정 | 거래 도메인 종료에도 대상 재입력(L3)을 넣는다. 공통 화면 폼 컴포넌트를 그대로 쓴다 | `TradePromotionsPage.tsx:500-517` | 없음 | 없음 | 재입력 없으면 버튼 꺼짐 시험 | A |
| AD-129 · AD-308 | 수정 | 이력 「상세」가 그 항목 하나를 연다: 피드 신청 → `/admin/feed-ad-requests/[id]` · 피드 운영자 → `/admin/feed-ads/[campaignId]` · 팝업 → `/admin/platform-popup/[campaignId]` · 옛 사장님 팝업 → 신청 상세(있으면) 아니면 링크 숨김 | `project-history-timeline.ts:479-483,899,1012` | 없음 | 권한이 없는 상세로 가면 403 → 링크도 권한 기준으로 숨긴다 | 링크 생성 시험 | A |
| AD-301 | 수정 | 「Admin 직접 등록」→「운영자 등록」 · 칩 「community/trade」→「커뮤니티/거래」 | `AdminAdvertisingWorkspace.tsx:843,1250` | 없음 | 없음 | 문구 시험(한국어 화면에 영문 코드 0) | A |
| AD-302 | 수정 | 「Popup (legacy owner)」→「사장님 팝업(이전 방식)」 · 「오너 신청」→「사장님 신청」 · 「…mutation이 없습니다」→「바뀐 내용이 없습니다」 | `project-history-timeline.ts:36,290,538,791,1007` · `AdminAdsHistoryLedgerView.tsx:221` | 없음 | 없음 | 같음 | A |
| AD-303 | 수정 | 「Admin 전용」→「운영자 전용」 | `products-control-model.ts:584` | 없음 | 없음 | 같음 | A |

**집계 (표 행 43개 = 명세 §2 목록 전부 · 겹치는 ID 는 한 행)**: 수정 40 · 문서 정정 + 시험 1(FB-C07) · 실기 측정 뒤 결정 1(DB-C07) · P0 1(FB-M13). 그냥 두는 결함은 없다.
- 겹치는 ID 묶음: PB-54=AD-126 · FB-A06=AD-207 · FB-A07=AD-110·111·206 · AD-009=AD-304 · AD-129=AD-308
- 명세 영역 표의 「다름」 수(46)와 행 수가 다른 이유: 위 겹침 묶음이 있고, §2 목록에만 있던 PB-29·IN-S11 이 행에 더해졌다.

---

## 4. Owner 결정 D-1~D-30 구현 설계 (조건부 7 · 변경 1 · 추가 확인 3 중심)

권장안 그대로인 22건 중 위 §3 에 이미 들어간 것: D-1(PT-07) · D-12(PB-26·29) · D-16(IN-S11) · D-23(FB-C07) · D-21(PU-31). 나머지는 아래 표.

| D | 조건 | 설계 | 파일·DB | 회귀 위험 | 시험 | 묶음 |
|---|---|---|---|---|---|---|
| D-2 | — | 「다시 보지 않기」 초기화 = 이미지 교체 + CTA 목적지 변경만. 소재 revision 에 목적지 해시를 더한다. 제목·본문 수정은 revision 을 바꾸지 않는다 | `load-popup-candidates.ts:265-271` · `admin-campaign-writer.ts:482-500` | 이미 숨긴 회원은 그대로 숨겨진다(새 revision 일 때만 다시 보임) | revision 계산 시험 3종 | A |
| **D-3** | 기기 SSOT 충돌 확인 | **충돌 없음(문서 확인)**. `docs/dibay-device-fd3-orientation-enforcement-hard-lock.md:68` 에 「`GlobalPopupHost` landscape deny \| POPUP presentation \| FD9」로 이미 올라 있다. 휴대폰은 세로 고정이라 해당 없고, TABLET_ANDROID 만 가로가 된다. **코드 변경 없음**. 팝업 계약 문구만 FD9 를 참조하게 고친다 | 문서만 | 없음 | 실기 V-12(Xiaomi 가로 → 팝업 보류 · 세로 복귀 → 표시) | 문서 |
| **D-4** | https + 승인 + 형식·위험 리다이렉트·금지 유형 | 지금(`lib/destination/destination-contract.ts:58-67`): `javascript·data·file·vbscript` 거부 · https 만 허용. **더 넣을 검사**:<br>① 주소에 계정 정보(`user@`) 있으면 거부<br>② 호스트가 IP 주소·`localhost`·`.local`·사설 대역이면 거부<br>③ 2,048자 넘으면 거부<br>④ 한글·특수 문자 도메인은 punycode(`xn--`)로 바꿔 어드민 확인 화면에 **실제 주소로 보인다**(닮은 주소 속임 방지)<br>⑤ 알려진 단축·리다이렉트 서비스(bit.ly 등 목록)는 거부하고 「최종 주소를 넣어 주세요」로 안내. 목록은 코드 상수 1곳<br>⑥ 열 때는 지금처럼 앱 밖 브라우저(Capacitor Browser · `noopener`). 앱 WebView 안으로는 열지 않는다<br>⑦ 저장 때만이 아니라 **보낼 때(고객 응답 만들 때)도** 같은 함수로 다시 걸러, 옛 데이터를 막는다<br>리다이렉트를 서버가 직접 따라가 보는 것은 하지 않는다(SSRF 위험 · 결과가 바뀔 수 있음) | `lib/destination/destination-contract.ts` (팝업·PTR·피드·이벤트가 모두 이 함수를 쓴다: `cta.ts` · `feed-ad-destination.ts` · `platform-events/admin-validation.ts` · `DibayPtrRevealAdLayer.tsx` · `GlobalPopupHost.tsx`) | 운영에 이미 저장된 외부 주소 중 새 규칙에 걸리는 것이 있으면 노출이 멈춘다 → 구현 전 운영 읽기 조회로 해당 행을 먼저 센다(읽기만) | 금지 유형별 단위 시험 12개 | A |
| **D-5** | 정지 기간 보전 · 운영 귀책 비례 환급 · 회원 귀책 0 · 중복·재시도 안전 | 상위노출의 `admin_promotion_resume`·`admin_promotion_end`(`20270521120800_…promotion_refund.sql`)와 **같은 방식으로 피드 배너 함수 2개**를 새로 만든다:<br>· `admin_feed_ad_resume` — `paused_at` 부터 지금까지만큼 `end_at` 연장 · `paused_by='admin'` 일 때만<br>· `admin_feed_ad_end(p_fault, p_preview)` — `operator` 면 `floor(결제액 × 남은 초 / 전체 초)` 환급, `member`·`none` 이면 0<br>· 결제액은 원장의 실제 차감 합(신청 승인 + 연장)<br>· 환급 원장 id = `feed-ad-end-refund:<campaignId>` 고정 → 두 번 불러도 1행(고유 제약)<br>· 이미 끝난 캠페인이면 `already_ended` · 미리보기(`p_preview`)는 어드민 화면에 환급액을 먼저 보인다<br>· 회원 자발 정지는 없으므로 `paused_by` 는 지금 `admin` 만 쓴다(FB-M11) | 마이그레이션(함수 2 + 칸 2 + 원장 고유 키) · `pause-resume-feed-ad-campaign.ts` · `save-event-distribution.ts` `retireFeedAdCampaign`(이벤트 종료 = 귀책 `none`) · 어드민 종료 폼(귀책·미리보기 · 상위노출 폼 재사용) | 운영 귀책을 고르면 포인트가 나간다 → L3(사유 + 대상 재입력) | 롤백 시험: 정지 2시간 → 재개 → `end_at` +2h · 운영 귀책 종료 2번 → 환급 1행 · 회원 귀책 → 0 · 원장 합 = 잔액 변화 | B → A |
| D-6 | — | 마이 › 광고 카드에 「운영자가 멈췄습니다 / 종료했습니다」 + **공개용 사유 1줄**. 어드민 사유 입력을 「공개 사유(회원에게 보임)」와 「내부 메모」 두 칸으로 나눈다. 공개 사유는 120자 | `feed-ad-member-presentation.ts` · 회원 응답 · 어드민 확인창 | 내부 메모가 새면 안 된다 → 회원 응답 시험에서 내부 메모 0 | 응답 시험 | A (+ 칸은 B) |
| **D-7** | 표시는 안내 · 서버·DB 최종 판정 · 동시 신청·승인 | ① 신청 화면에 「남은 자리 N」을 보인다(안내용 · 위치+업종 키, FB-A11 과 같은 함수)<br>② 가득 차면 신청 버튼을 막는다(화면)<br>③ **서버**: 신청 API 가 보류 전에 같은 함수로 다시 센다. 가득이면 409 `capacity_full`, 보류 0<br>④ **DB**: 최종 판정은 지금 있는 트리거 `feed_ad_pool_capacity_guard`(승인 때)가 한다. 신청 단계는 자리를 잡지 않는다(신청은 심사 전이라 자리를 미리 잡으면 남용된다)<br>⑤ 동시 승인은 FB-P09 설계로 처리 | 신청 화면 · `POST /api/me/feed-ad-requests` · 기존 트리거 | 신청 때 남은 자리가 있어도 승인 때 찰 수 있다 → 화면에 「승인 때 자리가 차면 포인트는 돌려드립니다」 | 동시 신청 10건 시험(자리 2): 보류 10 가능 · 승인 2 · 나머지 「자리 없음 대기」 · 원장 일치 | A |
| D-8 | — | 관리자 종료 뒤 새 신청 허용. 지금 막는 검사가 있으면 연다(FB-M01 「진행 중 1개」만 유지) | `POST /api/me/feed-ad-requests` | 없음 | 종료 후 신청 → 201 | A |
| D-9 | — | 거래와 같은 만료 cron 을 커뮤니티에도 둔다. 거래 `app/api/cron/trade-promotion-orders-expire/route.ts` 와 같은 구조로 `community-promotion-orders-expire` 를 만든다. 지난 `active` → `expired`. 환급 없음 | 새 cron 라우트 · `vercel.json` cron · 마이그레이션(만료 함수) | 지금 기간이 지난 `active` 행이 한꺼번에 `expired` 로 바뀐다 → 적용 전 대상 수를 읽기 조회로 보고 | 롤백 시험 · 라우트 시험 | B → A |
| **D-10** | 회원 삭제·숨김 권장안 · 관리자 삭제는 귀책 구분 | 거래 `trade_promotion_sync_listing` 과 같은 방식의 `community_promotion_sync_post` 트리거:<br>· **회원이 지움** → 종료 · 환급 0 (귀책 `member`)<br>· **회원이 숨김** → 정지(`paused_by='system'`) · 다시 보이면 재개 + 숨긴 시간만큼 연장<br>· **관리자 삭제·숨김**은 트리거로 끝내지 않는다. 관리자 화면이 삭제 전에 「상위노출 중입니다 · 귀책 선택(운영/회원)」을 묻는다. 그다음 `admin_promotion_end(p_fault)` 를 먼저 부르고 삭제한다(운영 귀책 = 남은 비율 환급)<br>· 트리거는 「관리자가 지운 경우」를 직접 구분하지 못한다. 그래서 관리자 경로가 먼저 주문을 끝내 두고, 트리거는 이미 끝난 주문을 건드리지 않는다 | 마이그레이션(트리거 1) · 커뮤니티 관리자 글 삭제·숨김 API · 확인창 | 관리자가 DB 에서 직접 지우면 트리거가 회원 삭제로 본다(환급 0) → 운영 수칙에 「화면으로만 삭제」 기록 | 롤백 시험 4종(회원 삭제·숨김·다시 보임·관리자 운영 귀책 삭제) · 원장 일치 | B → A |
| D-11 | — | 동네 탭 상위노출은 그 동네(지역 구간) 글만 위쪽. 다른 탭(전체·주제)은 지금대로 | `app/api/ads/active/route.ts` (지역 인자) · `CommunityFeed.tsx` | 동네 탭에서 광고가 줄 수 있다(의도) | 라우트 시험 | A |
| **D-13** | 비즈니스 캐시 비례 환급 · 원장·잔액·이력 일치 | 배달 배너 진행 중 **운영 귀책 종료**에 남은 기간 비례 환급. 기존 `business_cash_delivery_ad_refund`(반려 환급)를 재사용한다:<br>· 금액 = `floor(선차감액 × 남은 초 / 전체 초)`<br>· 원장 키 = `delivery-ad-end-refund:<campaignId>` 고정(1회)<br>· 같은 트랜잭션에서 캠페인 `ended` + 원장 + 잔액 + 운영 이력(`DELIVERY_AD_AUDIT_LOG_TABLE`) 1행<br>· 사장님 귀책·기간 만료 = 0<br>· 미리보기 먼저 | 마이그레이션(`admin_delivery_ad_end_with_refund`) · 공통 화면 종료 폼(귀책 칸) · 배달 상세 | 매장 정산 SSOT(수수료 = 주문 트리거)와 다른 돈이다. 비즈니스 캐시 원장만 쓰고 수수료 표는 건드리지 않는다 | 롤백 시험: 50% 지점 운영 종료 → 환급 = 선차감 × 0.5 · 두 번 → 1행 · 잔액 = 원장 합 · 이력 1행 | B → A |
| D-14 | — | 마이 배너 노출·클릭 칸을 숨긴다 | 마이 배너 어드민 목록 | 없음 | 렌더 시험 | A |
| D-15 | — | 마이 배너 「광고」 표시 없음 확인(코드 grep). 있으면 지운다 | 마이 배너 컴포넌트 | 없음 | 렌더 시험 | A |
| **D-17** | OS Start 정책과 충돌 없음 · 무한 대기 해결 | §5 | §5 | §5 | §5 | C |
| D-18 | — | 폼 기본 `once_per_day` 를 계약 문서에 정본으로 적는다 | 문서 | 없음 | — | 문서 |
| D-19 | — | 공통 화면 머리글 「아래 카드에서 바로 이동」 | `AdminAdvertisingWorkspace.tsx` | 없음 | 문구 시험 | A |
| D-20 | — | 도메인 메뉴 「만들기」 → `?domain=` 을 붙여 도메인을 미리 고른 채 연다 | 메뉴 링크 · 만들기 화면 첫 상태 | 없음 | 첫 상태 시험 | A |
| **D-21** | CLOSE 행 제거 · 유효 숨김 조회 · **요청 제한 유지 + 최소 장치** | ① PU-31 대로 CLOSE 행 제거<br>② 숨김 조회를 「효과 있는 행(오늘·다시 보지 않기) + 기간 안」으로 한정<br>③ **요청 제한**: 공용 `enforceRateLimit`(`lib/http/api-route.ts`)으로 4개 API 에 프리셋을 넣는다(`lib/security/rate-limit-presets.ts`): `platform-popup/events` · `platform-popup/suppress` · `feed-ads/events` · `stores/ads/impression`. 키 = 로그인 회원 id, 없으면 IP 해시. 한도는 정상 사용의 몇 배로 잡는다(예: 1분 120회). 넘으면 **429 를 내되 화면 동작은 막지 않는다**(기록만 버림)<br>④ 팝업 이벤트에 「같은 보는 사람 · 소재 · 종류 · 10분 1번」 중복 거르기(피드와 같은 방식)<br>⑤ Redis 가 없으면 제한은 꺼지고 ④ 만 남는다(지금 공용 함수의 동작) | 4개 라우트 · 프리셋 · 팝업 이벤트 중복 거르기(서버 · DB 고유 키는 B) | 한도가 낮으면 정상 기록이 빠진다 → 한도는 넉넉히, 429 수를 로그로 센다 | 라우트 시험(한도 넘김 → 429 · 화면 영향 없음) | A (+ 고유 키 B) |
| D-22 | — | 변경 없음(지금대로) | — | — | — | — |
| **D-23** | 샘플 카드 섞임 검증 | FB-C07 행 | — | — | — | A |
| D-24 | — | 커뮤니티 피드 배너도 광고주 이름 + 「광고」(FB-C17 표시 함수 공유) | `FeedAdBannerCarousel.tsx` 커뮤니티 분기 | 없음 | 렌더 시험 | A |
| D-25 | — | 어드민 노출 숫자 옆에 「소재별 노출 합」 안내 | 피드 어드민 상세 | 없음 | 문구 시험 | A |
| D-26 | — | 거래 `/write` 팝업 제외 목록에 넣는다 | 팝업 경로 제외 목록 | 없음 | 경로 시험 | A |
| D-27 | — | 이미지 `decode()` 가 끝난 뒤 팝업 틀을 보인다(PTR 과 같은 원칙). 실패하면 띄우지 않는다 | `GlobalPopupHost.tsx` | 이미지가 느리면 팝업이 늦게 뜬다 → 3초 안에 준비 안 되면 이번 세션은 건너뜀 | 렌더 순서 시험 | A |
| D-28 | — | 매장 없는 자체 배너에도 노출 토큰을 발급해 기록한다(`storeId` null 허용) | 배달 배너 토큰 발급 · `stores/ads/impression` | 노출 표에 `store_id` null 행이 생긴다 → 매장별 집계 쿼리가 null 을 빼는지 확인 | 라우트 시험 | A (+ null 허용이 DB 제약이면 B) |
| D-29 | — | 검색어가 있으면 피드 배너를 끼우지 않는다 | `plan-trade-grid-feed-ads.ts` 호출처 · 커뮤니티 검색 | 없음 | 검색 결과 0 광고 시험 | A |
| **D-30** | 광고 식별 의무·앱 심사 위험 근거 | **근거 결과** (§1 L-1~L-4):<br>· Apple 은 「화면을 가리는 광고」에만 광고 표시를 명시한다<br>· Google 은 「앱 내용과 구분」을 요구하고, 피드 안 광고는 네이티브 광고로 신고하게 한다<br>· 한국 공정위는 표시 문구를 첫 부분에 두게 한다<br>· Meta 는 Sponsored·Promoted·Ad 를 쓴다<br>**판정**: 「포인트 노출」이 이 기준을 만족하는지는 **NOT_PROVEN**(심사 기관이 그 문구를 광고 표시로 보는지 근거 없음). 위험 정도 = 중간. 배경 + 글자가 있어 「구분」은 된다. 다만 「돈을 낸 노출」이라는 뜻이 분명하지 않다.<br>**처리**: Owner 확정을 유지하고 코드는 바꾸지 않는다. Play Console 「광고 포함」 신고에 커뮤니티 상위노출도 넣는다(Owner 작업). 심사에서 지적되면 「포인트 노출 · 광고」로 바꿀 수 있게 문구 키 1개(`community_top_fix_badge`)로 모아 둔다(이미 그렇다). R-A(결제 수단)가 더 큰 위험이다 | 없음 | — | — | 기록 |

---

## 5. 앱 시작 경로 영향 분석 (D-17 · D-16 · IN-S10 · IN-S11 · IN-P10) — 묶음 C

**기준**: 기존 OS Start 정책 = 시작 화면(splash)은 **한 곳만 닫는다**. 인트로가 해제 권한을 가졌다가 실패하면 커뮤니티로 넘긴다(I-4 문서 §2·§3). Apple·Google 은 시작 화면을 끝없이 두면 안 된다고 본다(Android 12 SplashScreen 은 앱이 닫을 때까지 유지 → 앱 책임).

| 단계 | 지금 | 바꾼 뒤 |
|---|---|---|
| preparing 중 예외 (IN-S11) | async IIFE 에 바깥 catch 가 없다(`LaunchIntroRoot.tsx:77-150`). 예상 밖 예외가 나면 preparing 에 머문다 → 시작 화면이 안 닫힐 수 있다 | IIFE 전체를 `try/catch/finally` 로 감싼다. 예외가 나면 `handoff("prepare_exception")` → 커뮤니티가 시작 화면을 닫는다. **타이머가 아니다**(D-16 결정 4 유지) |
| preparing 중 백그라운드 (IN-S10) | 백그라운드 감지는 showing·exiting 에만 붙는다(`:241-250`). 돌아오면 준비가 이어진 뒤 인트로가 나온다 | 감지를 preparing 부터 붙인다. 백그라운드가 되면 준비를 멈추고(`AbortController`) 커뮤니티로 넘긴다. 같은 epoch 에는 다시 보이지 않는다(I-4 표와 같음) |
| 손상 게시본 (IN-P10) | 500 → 기기는 이전 state 를 쓴다 | 200 `unpublished` → 인트로 없음 |

- **바뀌는 파일**: `components/launch-intro/LaunchIntroRoot.tsx` · `lib/launch-intro/server.ts` · `app/api/launch-intro/live/route.ts` · `lib/launch-intro/discovery.ts`. 네이티브 파일은 없다. 웹 배포만이고 앱 재시작으로 반영된다.
- **영향받는 경로**:
  - 콜드 스타트
  - 웜 스타트(백그라운드 복귀)
  - 인트로 있음·없음
  - 오프라인
  - 첫 설치
  - 시작 화면 닫는 신호(`SplashScreen.hide` 호출 1곳)
- **OS Start 충돌 확인**: 닫는 곳은 지금처럼 **커뮤니티 handoff 1곳**이다. 인트로가 직접 닫는 경로를 새로 만들지 않는다. 그래서 두 번 닫거나 안 닫는 경로가 생기지 않는다. 구현 전에 `SplashScreen.hide` 호출처를 grep 해 1곳인지 확인한다.
- **구 바이너리**: 네이티브 무변경이다. 설치된 모든 버전에서 같은 웹을 쓴다.
- **회귀 위험**:
  - 준비가 느린 기기에서 백그라운드를 잠깐 다녀오면 인트로를 못 본다(의도).
  - 예외 시에는 인트로가 생략된다.
- **롤백**: 이 묶음은 단독 커밋이다. `git revert` 1번이면 되고 DB 는 없다.
- **시험**:
  - 코드: 가짜 예외 주입 → handoff 1회 · 시작 화면 닫힘 1회
  - 코드: preparing 중 `visibilitychange=hidden` → handoff · 인트로 렌더 0
  - 코드: 손상 문서 → 200 unpublished
- **실기**: V-16 · V-17.

---

## 6. 어드민 정지·재개 사유와 감사 (공통 규칙 · FB-A05/A06/A07 · AD-103/110/111/206/207 · N-05)

| 규칙 | 내용 | 적용 |
|---|---|---|
| 단계 | 정지 = L2(사유) · 재개 = **L2(사유)** · 종료 = L3(사유 + 귀책 + 대상 재입력 + 환급 미리보기) | 상위노출·피드·팝업·배달 모두. `admin-action-levels.ts` 한 표 |
| 사유 칸 | 공개 사유(회원·사장님에게 보임 · 120자) + 내부 메모(어드민만) | D-6 |
| 저장 | 사유는 캠페인 칸을 덮어쓰지 않는다. 감사 표에 조치마다 1행 | FB-A06 |
| 감사 내용 | `action`(이름 하나) · `before_json` · `after_json` · `reason_public` · `reason_internal` · `fault`(종료) · `refund_amount` · 화면(허브/도메인) | AD-207 |
| 감사 이름 | `<대상>.<조치>` 하나. 피드 = `feed_ad_request.*` · 상위노출 = `trade_promotion_order.*`/`community_promotion_order.*` · 팝업 = `platform_popup.transition` · 배달 = 배달 감사 표 | AD-206 |
| 권한 | 버튼은 권한이 없으면 사유 창 **전**에 꺼진다 | AD-204 · PB-54 |
| 시험 | 조치 × 화면 표 시험: 같은 조치는 두 화면에서 같은 단계·같은 감사 이름·before/after 있음 | 1개 시험 파일 |

---

## 7. 돈 — 포인트·비즈니스 캐시 원장 일치

| 규칙 | 포인트(상위노출·피드) | 비즈니스 캐시(배달) |
|---|---|---|
| 결제 재시도 | 키 1개 = 결제 1회(L-6) · 서버 처음 결과 반환 | 지금 사장님 제출 함수(`owner_submit_delivery_ad_with_business_cash_atomic`) 유지 |
| 정지 시간 | 재개 때 연장(상위노출·피드 D-5) | 이번 범위 밖(명세 결정 없음) |
| 운영 귀책 종료 | `floor(결제액 × 남은 초 / 전체 초)` 환급 | 같은 식(D-13) |
| 회원·사장님 귀책 · 만료 | 0 | 0 |
| 1회 보장 | 환급 원장 id 고정 + 고유 제약 · 이미 끝난 대상은 `already_ended` | 같음 |
| 같은 트랜잭션 | 상태 변경 + 원장 + 잔액 + 감사 | 같음 + 배달 이력 |
| 대조 시험 | 롤백 시험마다 마지막에 「잔액 변화 = 원장 합」을 `RAISE` 전에 검사 | 같음 |
| 돈 계산 위치 | **DB 함수만**(TS 는 미리보기 표시만) | 같음(매장 수수료 SSOT 와 같은 원칙) |

---

## 8. UI/UX·CTA·휴대폰/태블릿

| 항목 | 기준 | 설계 |
|---|---|---|
| 터치 크기 | Apple HIG 44×44pt · Android 48dp | PTR CTA(PT-07) · 피드 배너 점 · 팝업 × 를 이 크기로 맞춘다. 렌더 시험에서 크기 클래스를 확인한다 |
| 표시 | L-1~L-4 | 「광고」/「포인트 노출」 글자를 카드 첫 부분에 둔다. 색만으로 구분하지 않는다(WCAG 1.4.1) |
| 시각 | D-12 | PHT 「11월 6일 18:00」 · 영어 「Nov 6, 18:00」 |
| 빈 상태 | 명세 AD-3xx | 광고 0 이면 자리를 그리지 않는다(DB-C07 은 측정 후) |
| 태블릿 | FD3 | 가로 팝업 보류(D-3) · 피드 배너는 3:1 유지 · 2칸 격자 줄 끝(D-23). 태블릿 세로·가로 렌더는 실기 V-12·V-13 |
| 오류 문구 | 「모든 문구 한국어」 | 원문 오류(`error.message`·코드값)를 화면에 보이지 않는다(FB-A10 · IN-A05 · AD-301~303) |
| 어드민 | 매장 어드민 UI 셸 규칙은 사장님 화면용이라 대상 아님 | 공통 광고 화면 기존 컴포넌트 사용 |

---

## 9. 「확인 못 함」 22건 — 확인 방법

| ID | 확인 방법 | 언제 |
|---|---|---|
| PB-23 | D-11 구현 후 라우트 시험(동네 탭 = 그 동네만) | ③ 시험 |
| PB-45 | D-9 적용 전 운영 읽기 조회(기간 지난 active 수) → cron 롤백 시험 | B 적용 전 |
| PB-51 | D-10 롤백 시험 4종 | B 적용 전 |
| PB-C10 | 시안은 승인 전 시안이라 칩만(지금) 유지한다. 실기 V-3 캡처로 표시만 확인 | 실기 |
| FB-C05 | 하위 카테고리 화면의 `categoryId` 출처를 코드로 추적하고, 하위 카테고리 화면 라우트 시험 | ③ 시험 |
| FB-M01 | 동시 신청 시험(D-7 시험과 같이). 「회원당 1개」가 깨지면 부분 고유 인덱스를 B 에 추가 | ③ 시험 → 필요하면 B |
| FB-X15 | D-29 구현 시험 | ③ 시험 |
| PU-10 | D-27 구현 시험 | ③ 시험 |
| PT-21 | 근거 없음(정본 값 없음) → PTR CTA 방문 채널은 팝업과 같은 값 `landing` 으로 둔다(규정 5: 기존 계약 PTR §11.2 「팝업과 동일」로 정할 수 있음) | ③ |
| PU-43 | 메뉴 링크 시험(별칭 → `/admin/advertising?family=popup&domain=delivery`) | ③ 시험 |
| PT-23 | 새 PTR 만들기 → allowlist 빈 목록 · 복사 시 audience 복사 시험 | ③ 시험 |
| DB-C12 | 배치 함수 `orderHomeRestStoresForPaidInsertion` 본문 읽기 + 순위 점수에 유료가 안 들어가는지 단위 시험 | ③ 시험 |
| DB-O06 | `canTransitionDeliveryAdLifecycle` 본문 읽기 + 사장님 역할 승인 거부 시험 | ③ 시험 |
| DB-A03 | 삭제 함수에 이력 0 검사가 있는지 읽기. 없으면 수정 대상으로 추가 보고(이번 범위에서 고치지 않음) | ③ 전 읽기 |
| IN-S11 | §5 예외 주입 시험 | ③ 시험 |
| X-04 | D-28 구현 시험 + 운영 읽기 조회(매장 없는 배너 수) | ③ |
| AD-105 | 팝업 기간 변경 writer 감사 읽기 + 시험 | ③ 시험 |
| AD-116 | 배달 도메인 상세 조치 단계·감사 대조 시험(§6 표 시험에 포함) | ③ 시험 |
| AD-117 | 배달 순서 변경 감사 읽기 | ③ 전 읽기 |
| AD-121 | 이벤트 카드 이동 링크 시험 | ③ 시험 |
| DB-C07 | 실기 V-15 콜드 스타트 영상 | 실기 |
| IN-S09 · P4 · P5 | 실기 V-16(백그라운드) · 기기 로그 | 실기 |

- 읽기로 확인한 결과가 「다름」이면 이번에 고치지 않는다(범위 고정). 결함으로 따로 보고한다.
- 「확인 못 함」은 확인 전까지 NOT_PROVEN 이다.

---

## 10. 회귀 방지

1. **동작 시험만 PASS 로 센다** — 문자열 검사는 보조다. 항목마다 「렌더 · 라우트 실행 · DB 롤백」 중 하나 이상을 쓴다(방법 문서 ③).
2. **옛 코드 실패 확인** — 결함 시험은 수정 전 코드에서 실패하고 수정 후 통과하는지 한 번 본다(FB-M13 · FB-P09 · PU-30 · IN-S11).
3. **공용 함수 1개로 모은다** — PHT 형식 · 목적지 검사(D-4) · 자리 세기(FB-A11·D-7) · 광고주 이름(FB-C17·D-24) · 마이 배너 노출 조건(MB-A03). 두 화면이 다른 계산을 하지 못하게 한다.
4. **계약 시험 갱신** — 마스터 계약 · `owner-decisions-2026-11-03.test.ts` · 어드민 동작 단계 표 시험 · 메뉴 계약 · `verify:trade-hot-path` · `verify:routes`.
5. **DB 는 더하기만** — 칸·함수 추가, 정책 삭제 1건(FB-M06). 웹은 B 적용 뒤에 반영한다. B 는 롤백 SQL 을 같이 둔다.
6. **검사 1회** — 최종 트리에서 `typecheck:build` · `typecheck:test` · 변경 vitest · eslint · verify 1회. 기존 실패(vitest 7파일 32건 · `single-community-surface-authority` · `r5-trade-list-routes`)는 그대로 구분해 보고한다.

---

## 11. 진행 순서 (승인 후)

| 순서 | 내용 | 승인 |
|---|---|---|
| 1 | 구현 전 읽기 조회(운영 SELECT): D-4 걸리는 외부 주소 수 · PB-45 기간 지난 active 수 · FB-C17 「Untitled」 행 수 · X-04 매장 없는 배너 수 · FB-M06 직접 INSERT 사용처 grep | 이 설계안 승인에 포함 |
| 2 | 묶음 B 마이그레이션 파일 작성 + 운영 롤백 시험(`RAISE EXCEPTION` · 남는 행 0) | 이 설계안 승인에 포함 |
| 3 | **묶음 B 운영 적용** | **별도 승인** (D-5·D-9·D-10·D-13·PB-39·PB-40·FB-M06·FB-M11·FB-E07·D-21 고유 키·D-28 제약 · 「Untitled」 데이터 정리) |
| 4 | 묶음 A + C 구현 → 검사 1회 → main 1회(C 는 단독 커밋) | 이 설계안 승인에 포함 |
| 5 | 실기 1회 (아래 20개) · 샘플 준비·정리 스크립트(운영 데이터) | **샘플 스크립트 실행 별도 승인** |

**실기 1회 항목 (20개 · 기기에서만 확인되는 것)**

| # | 항목 | 기기 |
|---|---|---|
| V-1 | 피드 배너 연장 끊김 재시도(비행기 모드) → 차감 1 | SM |
| V-2 | 거래 상위노출 「광고」·위쪽 | SM · iOS |
| V-3 | 커뮤니티 상위노출 배경 + 「포인트 노출」 · 남은 기간 없음(다른 계정) | SM · iOS |
| V-4 | 동네 탭 그 동네만(D-11) | SM |
| V-5 | 결제 창 시각 PHT 형식(기기 시간대 서울로 바꿔서) | iOS |
| V-6 | 피드 배너 노출·클릭 → 이동 · DB 1행 | SM |
| V-7 | 거래 격자 배너 줄 끝 · 샘플 섞임(D-23) | SM · Xiaomi |
| V-8 | 마이 › 광고 「운영자가 멈췄습니다」 + 공개 사유 | iOS |
| V-9 | 팝업 × → 다시 안 뜸(세션) · 「오늘 하루」 | SM |
| V-10 | 팝업 CTA → 이동 · dismiss 기록 없음 | iOS |
| V-11 | 외부 주소 CTA → 앱 밖 브라우저 | SM · iOS |
| V-12 | 태블릿 가로 팝업 보류 → 세로 표시(D-3) | Xiaomi |
| V-13 | PTR 띠: CTA 만 눌림 · 띠 빈 곳 눌러도 이동 없음 · 당겨서 새로고침 정상 | SM · iOS |
| V-14 | 배달 홈 상단 배너 스와이프·점 | SM |
| V-15 | 배달 홈 콜드 스타트 첫 그림 밀림 측정(DB-C07) | SM |
| V-16 | 인트로 준비 중 홈 버튼 → 복귀 시 커뮤니티 · 인트로 없음 | SM · iOS |
| V-17 | 인트로 정상 콜드 스타트 · 시작 화면 1번 닫힘 | SM · iOS |
| V-18 | 어드민 피드 정지(사유) → 재개(사유) → 운영 귀책 종료(환급 미리보기 = 실제) | 어드민 웹 |
| V-19 | 어드민 커뮤니티 글 삭제(상위노출 중) → 귀책 묻기 → 환급 | 어드민 웹 |
| V-20 | 배달 배너 운영 귀책 종료 → 비즈니스 캐시 환급 · 사장님 화면 잔액 | 어드민 웹 · SM |

- 실기 FAIL 은 바로 고치지 않는다. 명세 항목 · ③ 시험에서 놓친 이유 · 설계안 순서로 다시 올린다.

---

## 12. Owner 결정이 새로 필요한 것 (범위 밖 · 보고만)

| # | 내용 | 이번 설계에서 |
|---|---|---|
| N-1 | R-A 앱 안 상위노출 구매가 은행 송금·GCash 포인트로 되는 구조. Apple 3.1.3(g) · Google Play 결제 정책 위험 | 손대지 않음 |
| N-2 | D-30 「포인트 노출」 문구 위험(R-C) | Owner 확정 유지 · 위험 기록 |
| N-3 | DB-C07 은 실기 측정 뒤 설계안을 따로 올린다 | 측정만 |

## 출처 (오늘 열어 본 것)

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Google Play Ads policy](https://support.google.com/googleplay/android-developer/answer/9857753)
- [Google Play 네이티브 광고 신고 안내(검색 요약)](https://support.google.com/googleplay/android-developer/answer/9859455)
- [Meta Audience Network 정책 예](https://developers.secure.facebook.com/docs/audience-network/policy/example-2-4)
- [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [MRC Viewable Ad Impression Guideline](https://mediaratingcouncil.org/sites/default/files/Standards/081815%20Viewable%20Ad%20Impression%20Guideline_v2.0_Final.pdf)
- [신&김 추천·보증 심사지침 개정](https://shinkim.com/kor/media/newsletter/2613)
- [당근 피드 광고(대행사 글 · 2차)](https://inside.ampm.co.kr/insight/14213)
- [ASC Code of Ethics](https://asc.com.ph/our-standards/code-of-ethics/) — 네이티브 광고 조항은 확인 못 함
