# 광고 화면·동작 명세 (초안 · 승인 요청 · 2026-11-04 PHT)

> 방법 문서 `ads-root-cause-and-method-2026-11-04.md` 의 ① 단계입니다. 이 문서 하나가 광고 5영역과 어드민의 **정본 기준**이 됩니다.
> 기준 코드: main `5b832c7d4`. 운영 DB 는 SELECT 만 했습니다. 판정은 모두 **코드·DB 정의 수준**이며, 화면·실기는 NOT_PROVEN 입니다.
> 읽는 법:
> - 영역별 표의 「규칙」 칸 = 앞으로의 정본입니다.
> - 「같은가」 칸 = 지금 코드가 그 규칙과 같은지입니다.
> - 마지막의 「충돌·근거 없음」 표 = Owner 결정이 필요한 곳입니다.

## 0. 작업자 잘못 (먼저 보고)

- **FB-M13 (P0 · 돈)**: 피드 배너 회원 연장 화면은 버튼을 누를 때마다 결제 요청 키를 새로 만듭니다(`app/(main)/mypage/ads/MyAdsPageClient.tsx:315-318`). 응답이 끊긴 뒤 다시 누르면 **두 번 차감·두 번 연장**될 수 있습니다. P0 수정(R-01·R-02) 때 결제 화면 4곳만 고치고 이 화면을 빠뜨렸습니다. 코드를 직접 열어 확인했습니다.
- 이번 명세 작성에서 **처음 드러난 결함**도 있습니다. 앞선 감사들이 놓친 것입니다.
  - PT-07: PTR 띠 전체가 버튼이다. O-8 「지금 버튼만 눌린다」는 전제가 틀렸다.
  - FB-A05: 피드 배너 정지·재개에 사유가 없다. Owner 결정 1 「사유 보존」과 다르다.
  - FB-A15: 이벤트 배너 이미지를 바꿔도 피드에 반영되지 않는다.
  - FB-C07: 거래 목록 피드 배너 간격이 4~6을 넘을 수 있다.
  - IN-S11: 인트로 준비 중 예상 밖 오류가 나면 시작 화면이 닫히지 않을 수 있는 경로가 있다.
  - IN-S10: 인트로 준비 중 앱을 내렸다가 돌아와도 인트로가 나온다.
  - AD-009: 커뮤니티 어드민 구역 제목이 아직 「홍보」다.
  - AD-103: 팝업 재개 사유 단계가 화면마다 다르다.
  - AD-123: 거래 도메인 종료에 대상 재입력이 없다.

## 1. 규모 (표에서 자동으로 센 값 · 「다름」 = 「같은가」 칸에 다름이라고 적힌 행 수)

| 영역 | 규칙 수 | 지금 코드와 다름 | 확인 못 함 | 충돌·근거 없음 |
|---|---|---|---|---|
| 상위노출(거래·커뮤니티) `PB-` | 58 | 8 | 5 | 12 |
| 피드 배너 `FB-` | 76 | 12 | 3 | 15 |
| 팝업·PTR `PU-`·`PT-` | 74 | 6 | 4 | 11 |
| 배달·마이 배너·인트로 `DB-`·`MB-`·`IN-` | 68 | 6 | 4 | 11 |
| 어드민 공통 `AD-` | 57 | 14 | 6 | 8 |
| **합계** | **333** | **46** | **22** | **57** (→ Owner 결정 표 §3 30건 + 문서 정정 §4) |

## 2. 지금 코드와 「다름」 전체 (수정 대상 후보 · ② 대조 단계에서 수정 설계안으로 만든다)

| 심각도 | ID |
|---|---|
| **P0 돈** | FB-M13 피드 배너 연장 재시도 두 번 차감 |
| P1 | FB-A05 피드 정지·재개 사유 없음(Owner 결정 1) · FB-A06 피드 조치 사유 덮어쓰기·감사 변경 전 값 없음 · FB-A15 이벤트 배너 수정 미반영 · IN-S11 인트로 준비 중 예외 시 시작 화면 멈춤 경로 · PT-07 PTR 띠 전체 탭(결정 필요) · FB-P09 동시 승인에서 진 신청 「검토 중」 갇힘 |
| P2 | PB-9·PB-10 지역 조건 다른 경로 · PB-21·PB-22 커뮤니티 20개 상한·운영 고정 표기 · PB-26·PB-29 판매자 창 시각 시간대 · PB-39 거래 심사 중 중복(잠복) · PB-40 커뮤니티 가격 잠금 · PB-54/AD-126 가격 저장 버튼 권한 · FB-C07 거래 격자 간격 · FB-C17 「Untitled」 광고주 · FB-M06 신청 직접 저장 정책 · FB-M11 정지 주체 칸 없음 · FB-E07 소재 없는 기록 · FB-A07/AD-110·111·206 감사 이름 · FB-A10 자리 없음 원문 오류 · FB-A11 위치 지도 업종별 집계 · PU-13 보류 등록 빠진 창 2곳 · PU-30 CTA 뒤 dismiss 기록 · PU-31 CLOSE 행 누적 · PU-39 사장님 팝업 승인 원자성(잠복) · PT-22 PTR 순위 안내 · DB-C07 배달 첫 그림 140px · MB-C04 마이 배너 순서 · MB-A01 시작 전 배너 「활성」 · MB-A03 마이 배너 집계 조건 · IN-S10 준비 중 백그라운드 · IN-P10 손상 게시본 500 · IN-A05 손상 문구 원문 · AD-009 커뮤니티 구역 「홍보」 · AD-103 팝업 재개 단계 · AD-123 거래 종료 재입력 · AD-129/308 이력 상세 단건 · AD-207 감사 변경 전 값 · AD-301~304 영어·코드 문구 |

## 3. Owner 결정 표 — 권장안 포함 (「권장안대로」 한 번으로 승인 가능)

규정 5에 따라 문서끼리 표현만 다르고 정할 것이 없는 항목은 결정 표에 넣지 않았습니다. 이런 문서 정정은 Claude 가 합니다(§4).

| # | 결정할 것 | 권장안 | 근거 ID |
|---|---|---|---|
| D-1 | PTR 띠에서 누를 수 있는 곳 | **CTA 버튼만** 누르게 바꾼다(O-8 원래 뜻 · PTR 계약 §4.4 「명확한 CTA」) | PT-07 · PT-C1 |
| D-2 | 팝업 「다시 보지 않기」를 풀 「실질적 소재 변경」 범위 | **이미지 교체 + CTA 목적지 변경**. 제목·본문 문구 수정은 풀지 않는다 | PU-26 · PU-C1 |
| D-3 | 태블릿 가로 화면 팝업 | 지금처럼 **가로는 차단**(휴대폰·태블릿 공통)을 정본으로 한다 | PU-12 · PU-C3 |
| D-4 | 팝업·PTR 외부 주소 | **https + 어드민 승인 = 허용**(도메인 목록 없음). 계약 문구 정정 | PU-C5 |
| D-5 | 회원 유료 피드 배너 — 관리자 정지 시간·운영 귀책 종료 | **상위노출과 같게**: 재개 시 멈춘 시간만큼 연장 · 운영 귀책 종료 = 남은 비율 환급 · 회원 귀책 = 0 (DB 변경 · 별도 승인) | FB-X05 |
| D-6 | 관리자 정지·종료를 회원에게 알릴지 | 마이 › 광고에 「운영자가 멈춤/종료」 상태 + 공개용 사유 1줄(내부 메모와 분리) | FB-X07 · FB-M12 |
| D-7 | 피드 배너 신청 때 자리 | 신청 화면에 남은 자리를 보이고, **가득 차면 신청(보류) 전에 막는다** | FB-X10 |
| D-8 | 관리자 종료 뒤 새 신청 | **허용**(새 신청은 다시 심사를 거치므로 우회가 아님) | FB-X13 |
| D-9 | 커뮤니티 상위노출 만료 처리 | 거래와 같은 **만료 cron** 을 커뮤니티에도 둔다(DB · 별도 승인) | PB-C3 · R-06 |
| D-10 | 커뮤니티 글 삭제·숨김 ↔ 상위노출 주문 | **거래와 같은 규칙**: 회원 삭제 = 종료(환급 0) · 숨김 = 정지 · 다시 보이면 재개+연장(DB · 별도 승인) | PB-C4 |
| D-11 | 커뮤니티 동네 탭 상위노출 지역 조건 | 거래 P-3 과 같은 방향: **그 동네(지역 구간) 글만** 위쪽 | PB-C5 |
| D-12 | 고객 화면 날짜·시각 | **PHT(Asia/Manila) 고정**, 「11월 6일 18:00」 형식 | PB-C7 · R-14 |
| D-13 | 배달 배너 진행 중 운영 종료 환불 | 운영 귀책이면 **남은 기간 비례 환불**(비즈니스 캐시) — DB 변경 · 별도 승인 | X-05 · AD-C07 |
| D-14 | 마이 배너 노출·클릭 숫자 | **기록 없는 숫자 칸은 숨긴다**(기록은 추가하지 않음) | X-06 |
| D-15 | 마이 배너가 광고인지 | **광고 아님**(자체 안내 배너) · 「광고」 표기 없음 | X-07 |
| D-16 | 인트로 준비 단계 시간 제한 | **넣지 않는다**(결정 4 — 결과가 안전 타이머와 같음). 대신 IN-S11 예외는 잡아서 커뮤니티로 넘긴다(타이머 아님). 기기별 시간은 실기에서 잰다 | X-09 · IN-S11 |
| D-17 | 인트로 준비 중 백그라운드 | I-4 처럼 **커뮤니티로 넘기고 인트로 생략** — 시작 경로라 영향 분석 문서 먼저 | X-10 · IN-S10 |
| D-18 | 인트로 게시 폼 기본 빈도 | **하루 1번**(`once_per_day`, 지금 폼 값)을 정본 | X-11 |
| D-19 | 공통 광고 화면 머리글·인트로/PTR/마이/이벤트 CTA | O-5 그대로(카드 + 「관리」 이동). 머리글을 「아래 카드에서 바로 이동」으로 고친다 | AD-C02 · AD-C06 |
| D-20 | 도메인 메뉴의 「만들기」 | 만들기 화면이 **도메인을 미리 고른 채** 열린다 | AD-C05 |
| D-21 | 팝업 이벤트·숨김 API 요청 제한·CLOSE 행 | **CLOSE 행 쓰지 않기** + 숨김 조회를 「효과 있는 행·기간 안」으로 한정 · 요청 제한은 넣지 않음 | PU-C6 |
| D-22 | 글 상태로 상위노출이 끝날 때 회원 알림 | **알림 없음**(확인창 안내로 대신 · 지금대로) | PB-C9 |
| D-23 | 거래 격자 피드 배너 간격 | 「4~6 이후 **줄이 끝나는 첫 자리**」로 계약 문구를 고친다(코드 그대로) | FB-X04 |
| D-24 | 커뮤니티 피드 배너 광고주 이름 | 거래와 같게 **광고주 이름 + 「광고」** | FB-X08 |
| D-25 | 캠페인 노출 수 정의 | 「소재별 노출 합」이라고 어드민 숫자 옆에 적는다 | FB-X11 |
| D-26 | 거래 `/write` 화면 팝업 | 글쓰기 화면은 **팝업 제외** | PU-C9 |
| D-27 | 팝업 틀을 이미지 로드 전에 보일지 | **이미지가 준비된 뒤에 보인다**(PTR 과 같은 원칙) | PU-C4 |
| D-28 | 매장 없는 배달 자체 배너 기록 | **기록한다**(자체 배너도 성과 숫자 필요) | X-04 |
| D-29 | 피드 배너 검색 결과 목록 | 상위노출과 같게 **검색 결과에는 끼우지 않는다** | FB-X15 |
| D-30 | 커뮤니티 표기 「포인트 노출」의 규정 위험 | Owner 확정(11-04) 그대로 · 위험 기록만 | PB-C2 |

### §3 Owner 결정 결과 (2026-11-04 PHT · Owner 조건부 승인)

- **승인 범위**: 정본 확정 + ② 수정 설계안 작성. 코드 수정·운영 DB 변경·main·배포·네이티브·실기는 하지 않는다.
- **권장안 그대로 승인 (22건)**: D-1·D-2·D-6·D-8·D-9·D-11·D-12·D-14·D-15·D-16·D-18·D-19·D-20·D-22·D-23·D-24·D-25·D-26·D-27·D-28·D-29·D-30
- **조건부 승인 (7건)**:
  - **D-3**: 태블릿 가로 팝업 차단은 유지한다. 기기 SSOT 와 충돌하는지 확인한다.
  - **D-4**: HTTPS + 관리자 승인 + URL 형식·위험 리다이렉트·허용하지 않는 주소 유형을 검사한다.
  - **D-5**: 관리자 정지 기간을 보전한다. 운영 귀책은 비례 환급, 회원 귀책은 0이다. 원장 중복 처리와 재시도 안전을 지킨다.
  - **D-7**: 남은 자리 표시는 안내용이다. 서버·DB 가 최종 판정한다. 동시 신청·승인도 검증한다.
  - **D-10**: 회원 삭제·숨김은 권장안대로 한다. 관리자 삭제는 실제 귀책을 구분하고, 운영 귀책 환급 규칙과 충돌하지 않게 한다.
  - **D-13**: 운영 귀책 종료는 비즈니스 캐시로 비례 환급한다. 캐시 원장·잔액·관리자 이력이 일치해야 한다.
  - **D-17**: 기존 OS Start 정책과 충돌하지 않아야 한다. 시작 화면 무한 대기도 함께 해결한다.
- **변경 (1건)**:
  - **D-21**: 불필요한 CLOSE 기록 제거와 유효 기간 내 숨김 조회는 승인한다. 요청 제한은 없애지 않는다. 기존 장치와 실제 위험을 검증한 뒤 최소한의 안전장치를 둔다.
- **추가 확인 (3건)**:
  - **D-23**: 샘플 카드가 섞일 때 간격·정렬을 검증한다.
  - **D-30**: 광고 식별 의무·앱 심사 위험을 근거로 확인한다.
  - **D-16**: IN-S11 예외가 나도 정상 화면으로 복구되게 한다.

## 4. Claude 가 하는 문서 정정 (결정 불필요 · 코드 변경 없음)

- 배달 SSOT 를 현재 구현에 맞춘다. 근거 ID: X-01 · X-02 · X-03
  - 캐시 선차감·반려 환불은 구현돼 있고, 성과 과금은 아직 실행하지 않는다.
  - 홈 중간 예비 배너는 3개다.
- 인트로 13차 문서 `ACTIVE` 표기를 정정한다. 근거 ID: X-08
- 피드 배너의 「광고」 표기·3:1 비율·노출 키를 정본(HL·F-01)에 맞춰 PC·MC 문구를 고친다. 근거 ID: FB-X01 · FB-X02 · FB-X03
- 커뮤니티 「광고」 → 「포인트 노출」을 promotion 계약 §7b O-1·O-3 줄에 반영한다. 근거 ID: PB-C1
- CUT J 문서 표의 광고·배너 메뉴 수를 「7 + 바로가기」로 고친다. 근거 ID: AD-C01
- 피드 배너 판단 기준 문서: 「이력 상세 = 그 항목」은 결함 수정이고 결정할 것이 없다. 근거 ID: AD-C04

## 5. 다음

- 이 명세가 승인되면 ② 대조 단계로 넘어간다. §2 「다름」 전체와 §3 결정 결과를 **하나의 수정 설계안**(파일·영향·회귀·시험)으로 올린다.
- **FB-M13(P0 돈)** 은 결정할 것이 없는 결함이다. 수정 설계안 맨 앞에 넣는다.

---


### 상위노출(유료 노출) — 거래 + 커뮤니티

> 확인 조건: 코드는 `/Users/bkkim/projects/samarket-ads-s1` HEAD `5b832c7d4`(읽기 전용)이고, 운영 DB `ckdosyydvgzqwpbwuhon` 에는 SELECT 와 함수 정의 조회만 했습니다(2026-11-04 PHT).
> 운영 DB 상태: 광고 중인 주문은 0건입니다. 주문은 거래 종료 6·만료 2, 커뮤니티 종료 8·반려 2 입니다.
> 그래서 아래 「같음」은 모두 **코드·DB 정의 기준**입니다. 화면·실기기 판정은 전부 NOT_PROVEN 입니다. 코드·DB 변경은 0건, 커밋도 0건입니다.

#### 고객 화면
| ID | 화면·위치 | 규칙(무엇이 보이고 어떻게 동작) | 근거(문서:절 또는 Owner 지시) | 지금 코드 위치(file:line) | 지금 구현이 규칙과 같은가 |
|---|---|---|---|---|---|
| PB-1 | 거래 홈·카테고리 1페이지 | 광고 중인 글은 결제 시각(start_at)이 최근인 순서로 최대 3개를 고른다 | promotion 계약 §7b 「고르기」 · reaudit-final §2 ① · Owner 11-03 「최신순」 | `lib/promotion/feed-promotion-projection.ts:94` · `lib/promotion/select-trade-promotion-listings.ts:13-16` · `lib/promotion/promoted-top-pins.ts:6` | 같음 — start_at 내림차순으로 앞에서 3개만 자른다 |
| PB-2 | 거래 1페이지 | 첫 칸은 일반 글, 고른 글은 2~4번째 칸에 둔다 | 계약 §7b 「자리」 · stage3 P-1 | `select-trade-promoted-listings.ts:23-39` | 같음 — `minIdx=1` 뒤에 끼운다 (1페이지 일반 글이 0개면 0번째부터) |
| PB-3 | 거래 1페이지 4번째부터 | 위쪽에 끼우지 않고 일반 자리에 「광고」 칩을 단다. 기간은 그대로 흐른다 | 계약 §7b D-2 · reaudit-final D-2 | `feed-promotion-projection.ts:391-399` (`overlayTradePromotionBadges`) · `components/post/PostCard.tsx:251-258` | 같음 |
| PB-4 | 거래 2페이지 이후 | 끼우지 않는다. 일반 자리에 나온 광고 글에는 「광고」를 단다 | 계약 §7b D-2 | `feed-promotion-projection.ts:241,391` | 같음 — 1페이지에 끼운 글이 뒤에 다시 오면 화면이 id 로 거른다(주석 :11-13). 화면은 NOT_PROVEN |
| PB-5 | 거래 목록 예약중 글 | 광고 중이면 예약중이어도 「광고」 칩과 위쪽 자격을 유지한다 | 계약 §7b D-3 · lifecycle 설계 §2-1 「예약중 = 처리 안 함」 | `lib/promotion/trade-promotion-overlay.ts:33-45` · `PostCard.tsx:245-258` | 같음 |
| PB-6 | 거래 「판매완료」 탭 | 상위노출 글을 끼우지 않는다 | 계약 §7b 「끼우기 조건」 · full-audit P-3 | `feed-promotion-projection.ts:143-145,191` | 같음 |
| PB-7 | 거래 가격 범위 필터 | 가격 범위 안의 광고 글만 끼운다. 가격이 없는 글은 범위 밖으로 본다 | 계약 §7b · P-3 | `feed-promotion-projection.ts:148-160` · `lib/posts/home-posts-route-core.ts:879-881` | 같음 |
| PB-8 | 거래 지역 | 1페이지 일반 글 중 가장 가까운 지역 구간 안의 광고 글만 끼운다. 구간 밖 글은 일반 자리에 「광고」로 나온다 | 계약 §7b · stage3 P-3 | `feed-promotion-projection.ts:204-212` · `home-posts-route-core.ts:883-890` | 목록 API 는 같음. 다른 경로 2곳은 PB-9·PB-10 |
| PB-9 | 거래 `/api/trade/feed` (카테고리 첫 화면) | 목록 API 와 같은 끼우기 조건을 쓴다 | 계약 §7b · reaudit P-3② | `lib/posts/resolve-trade-feed-open-payload.ts:131-138` | 다름 — 동네(hood) 조건을 항상 `null` 로 넘긴다(주석으로 의도 표기) |
| PB-10 | 거래 첫 화면 서버 시드 | 목록 API 와 같은 끼우기 조건을 쓴다 | full-reaudit-11-04 R-11 (이월) | `lib/market/load-market-bootstrap-payload.ts:155-164` → `resolve-trade-feed-open-payload.ts:131` | 다름 — 시드 옵션에 `lguCityId` 가 없어 지역 구간 조건이 `null` 이다 |
| PB-11 | 거래 품목 옵션 필터 | 옵션이 맞는 광고 글만 끼운다 | reaudit-final R3 P-3 | `feed-promotion-projection.ts:195` | 같음 |
| PB-12 | 거래 검색어 있을 때 | 끼우지 않고 순위는 그대로 둔다. 광고 글에 칩만 단다 | 계약 §7b 「CUT F」 | `feed-promotion-projection.ts:359-370` · `home-posts-route-core.ts:877` | 같음 |
| PB-13 | 거래 목록·상세 공개 자격 | 판매완료·삭제·숨김·관리자 숨김 글은 노출하지 않는다 | 계약 §7b 「Sold/hidden」·§10 | `feed-promotion-projection.ts:265-278` · `trade-promotion-overlay.ts:9-16` | 같음 |
| PB-14 | 거래 상세 | 지금 광고 중이면 제목 위에 「광고」 칩을 단다. 다시 받을 때 끝났거나 멈췄으면 칩을 지운다 | owner-decisions O-3 | `services/trade/trade-detail.service.ts:207` · `app/api/posts/[postId]/route.ts:84-93` · `components/post/PostDetailView.tsx:1435-1441` | 같음 |
| PB-15 | 커뮤니티 목록 위쪽 | 운영 공지·고정 글 아래에 최근 결제 순 최대 3개를 둔다 | O-2 · 계약 §7b D-4 · Owner 11-04 「상위에 머무는 것이 중요」 | `components/community/CommunityFeed.tsx:1236-1242` · `lib/promotion/community-paid-exposure-feed.ts:54` | 같음 |
| PB-16 | 커뮤니티 목록 카드 | 일반 글과 같은 카드(작성자·지역·조회수·댓글·사진·시간)에 상위노출 배경과 작은 「포인트 노출」 글자만 더한다 | Owner 11-04 지시 1·3·4 → 「배경+글자」 확정 · master 계약 §1 「커뮤니티 상위노출 표시」 | `CommunityFeed.tsx:2015-2021` · `components/community/feed-list-layouts.tsx:69-77,130,332` · `app/design-tokens.css:77` · `lib/i18n/catalog/community-ui.ts:132` | 같음 (화면 NOT_PROVEN) |
| PB-17 | 커뮤니티 4번째부터 | 일반 자리에 같은 배경과 「포인트 노출」로 나온다 | O-2 | `CommunityFeed.tsx:1247-1256,2083-2087` | 같음 |
| PB-18 | 커뮤니티 남은 기간 | 남은 기간은 어떤 회원 화면(목록·상세)에도 보이지 않는다 | Owner 11-04 지시 2 · master 계약 §1 | `app/api/ads/active/route.ts:58` (`endAt` 제거) · `AdPostCard` 삭제(참조 0) | 같음 |
| PB-19 | 커뮤니티 상세 | 광고 중이면 말머리 줄에 「포인트 노출」(영어 Promoted)을 단다 | Owner 11-04 지시 4 · master 계약 §1 | `app/(main)/philife/[postId]/page.tsx:47` · `components/community/post-detail/CommunityPostCategoryRow.tsx:17` · `community-ui.ts:685` | 같음 |
| PB-20 | 커뮤니티 주제 탭 | 그 주제의 광고 글만 위쪽에 둔다. 주제를 먼저 거른 뒤 개수를 자른다 | stage3·double-check C-1 | `community-paid-exposure-feed.ts:93-100` · `CommunityFeed.tsx:1145` | 같음 |
| PB-21 | 커뮤니티 광고 개수 상한 | 광고 중인 글은 모두 위쪽 또는 일반 자리에 표시한다 | O-2 「나머지 광고 중인 글은 일반 자리에」 | `community-paid-exposure-feed.ts:39` (기본 20) · `app/api/ads/active/route.ts:27-29` (limit 없이 호출) | 다름 — 21번째 광고 글부터 배경·글자가 없다 (R-10) |
| PB-22 | 커뮤니티 운영 고정 + 광고 같은 글 | 광고 중이면 「포인트 노출」을 단다 | O-2 | `CommunityFeed.tsx:2005-2008` (운영 고정 카드에 `isAd` 없음) | 다름 — 운영 고정 자리에 있으면 표시가 없다 (R-10) |
| PB-23 | 커뮤니티 동네 탭 | (지역 조건 규칙 없음 → 근거 없음 표 PB-C5) | — | `CommunityFeed.tsx:1145` (동네 탭은 topic 을 보내지 않음) | 확인 못 함 — 지역과 상관없이 전체 광고 글이 위쪽에 온다(코드 확인). 화면은 NOT_PROVEN |

#### 판매자·작성자 화면 (결제 창·마이 화면)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PB-24 | 거래 광고 창 상품 줄 | 「거래 목록 첫 페이지 위쪽」 · 7일 500P / 14일 900P(DB 가격)를 보여 준다 | 시안 ① · double-check §2-4 · promotion 계약 §3 | `lib/i18n/catalog/trade.ts:229` · `app/api/me/points/promotion-orders/route.ts:55-78` | 같음 — 운영 DB 가격도 500·900 |
| PB-25 | 거래 광고 창, 광고 중인 글 | 「광고 중 · {날짜}까지」를 보이고, 상품 줄을 「N일 연장」과 「끝나는 날 → 날짜」로 바꾼다. 「연장해도 자리 그대로」 안내를 붙인다 | 시안 ② · D-1 · Owner 11-03 「연장」 | `components/trade/seller-ad/TradeAdQuickSheet.tsx:150-160,291,304,319,466-467` · `trade.ts:257` | 같음 |
| PB-26 | 거래 광고 창 끝나는 시각 표시 | 시안대로 「11월 6일 18:00」 형식으로 보인다 | 시안 ② (PHT 근거는 PB-C7) | `TradeAdQuickSheet.tsx:296-302` (`toLocaleString`, timeZone 없음) | 다름 — 기기 시간대·12시간제로 나온다 (R-14) |
| PB-27 | 거래 광고 창, 운영자 일시정지 | 「운영자가 광고를 잠시 멈췄습니다 · 남은 기간 N일」을 보이고, 막힌 버튼 「재개되면 연장할 수 있어요」를 둔다 | 시안 ③ · E-11 · S-2 | `TradeAdQuickSheet.tsx:308-314,340-344` · `trade.ts:238` | 같음 |
| PB-28 | 거래 광고 창, 글 숨김으로 멈춤 | 「글이 숨겨져 광고가 멈췄어요 · 남은 기간 N일」을 보인다 | lifecycle 설계 §2-3 | `TradeAdQuickSheet.tsx:312-313` | 같음 |
| PB-29 | 커뮤니티 결제 창 | 광고 중이면 끝나는 시각과 연장 줄(새 종료일)을 보이고, 일시정지면 상태만 보인다. 남은 기간은 작성자 본인에게만 보인다 | Owner 11-04 지시 2 · D-4 · R2 | `components/post/MemberPostPromoteSheet.tsx:98-106,140-142,366-435` | 같음 — 시각은 기기 시간대 `toLocaleString`(:343,378,415,435) (R-14) |
| PB-30 | 결제 버튼 다시 누르기 | 응답을 모르는 결제는 같은 키·같은 상품으로 다시 보내고, 서버는 「이미 처리된 결제예요」를 돌려준다 | full-reaudit-11-04 R-01·R-02·R-03 | `lib/points/promotion-attempt-key.ts` · `TradeAdQuickSheet.tsx:176-196,232,261` · `MemberPostPromoteSheet.tsx:224` · `route.ts:326-327` | 같음 (코드 PASS · 화면 NOT_PROVEN) |
| PB-31 | 가격이 그 사이 바뀜 | 결제하지 않고 「가격이 바뀌었어요」를 보인 뒤 새 값으로 다시 그린다 | price-sold-window 설계 §1-2 | `route.ts:226-233,421-427` · `TradeAdQuickSheet.tsx:270-271` | 같음 |
| PB-32 | 마이 › 광고 상위노출 행 | 산 당시 기간·금액, 시작→끝 날짜, 상태(광고 중·일시정지·숨긴 글·운영 검토·종료·판매완료·글 삭제·운영 정책)를 보인다 | lifecycle 설계 §2-3 ② · master 계약 §4 | `app/(main)/mypage/ads/MyAdsPageClient.tsx:503-541` · `lib/ads/my-ad-tab.ts:57-83` · `lib/i18n/catalog/mypage-routes.ts:157` | 같음 |
| PB-33 | 판매완료·삭제·숨김 확인창 | 광고 중일 때만 안내 한 줄을 넣는다: 「바로 끝나고 남은 기간 포인트는 돌려드리지 않아요」 / 「숨기는 동안 멈추고 다시 보이면 이어져요」 / 심사 중이면 「취소돼요」 | lifecycle 설계 §2-3 ① | `lib/promotion/trade-boost-listing-notice.ts:73-112` · `trade.ts:234` · 사용처 6곳(상세 ⋮·목록 메뉴·내 매물·채팅 2곳·상세) | 같음 — 1.2초 안에 상태를 못 받으면 안내 없이 진행(설계 B-6) |
| PB-34 | 판매자 광고 창 진입 자격 | 본인 글이고 판매중(예약중 포함)일 때만 결제된다 | promotion 계약 §2·§7b | 운영 DB `purchase_member_content_promotion` (forbidden·target_unavailable·completed) | 같음 (DB 정의) |

#### 돈 규칙 (결제·연장·재시도·일시정지·종료·환급·만료·글 상태 연동)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PB-35 | 가격 원본 | 가격·기간은 DB `member_promotion_products` 에서만 읽고, 이미 산 주문에는 새 가격을 적용하지 않는다 | promotion 계약 §3 · price-sold-window 설계 §1 | `route.ts:55-61,502-511` · 운영 표(rev: 거래 7일 3 · 나머지 1) | 같음 |
| PB-36 | 광고 중 재결제 | 같은 주문을 연장한다: `end_at += 기간`, 주문 기간·금액 합산, 원장 `promotion_extend`. start_at 은 그대로라 자리도 그대로다 | promotion 계약 §2·§7b · D-1 | 운영 `purchase_member_content_promotion` 연장 분기 · `purchase_member_community_promotion` | 같음 (DB 정의) |
| PB-37 | 같은 결제 재시도 | 같은 요청 키는 가격 비교보다 먼저 처음 결과를 돌려주고 추가로 차감하지 않는다 | §7b 원장 · R-04 | `route.ts:201-225` · `lib/promotion/promotion-purchase-replay.ts` · 운영 함수 idempotent 분기 | 같음 |
| PB-38 | 일시정지 중 재결제 | 운영자·글 상태 일시정지는 종료일과 상관없이 진행 중으로 보고 409 `already_active_promotion` 을 낸다 | §2 · E-10 · E-15 | 운영 두 결제 함수 `(order_status='paused' OR end_at>=now())` · `lib/promotion/trade-boost-order-state.ts:14-29` | 같음 |
| PB-39 | 남의 주문·심사 중 | 409 를 낸다(중첩 주문 없음) | §2 | 커뮤니티 함수는 `pending_review` 포함 | 다름(거래) — 거래 함수는 `IN ('active','paused')` 만 봐서 심사 중을 막지 않는다 (R-12 잠복, 승인형 상품 0개) |
| PB-40 | 가격 잠금 | 결제 순간 가격을 다시 읽고 잠근다 | price-sold-window 설계 §1-2 | 거래 `purchase_member_content_promotion_v2` · 커뮤니티 `lib/promotion/apply-community-paid-exposure.ts:196-208` (코드가 넘긴 값 사용) | 다름(커뮤니티) — 함수 안에서 다시 읽지 않는다 (R-09 · 앞단 `route.ts:226` 비교만) |
| PB-41 | 운영 귀책 종료 환급 | (spend + promotion_extend 합계) × 남은 비율(멈춘 시간 제외)을 주문당 1회 환급한다. 회원 귀책·없음 = 0 | §7b 원장 · lifecycle §1 | 운영 `admin_trade_promotion_end` · `admin_promotion_end` | 같음 |
| PB-42 | 환급 원장 문구 | 거래 「거래 상위노출 종료 환급 (운영 사유)」 · 커뮤니티 「커뮤니티 상위노출 종료 환급 (운영 사유)」 | O-10 | 운영 두 종료 함수 | 같음 |
| PB-43 | 운영자 일시정지·재개 | 정지·재개 모두 사유 2자 이상. 재개 시 `end_at += 멈춘 시간` | reaudit E-14 · N-02·N-03 | 운영 `admin_trade_promotion_pause/resume` · `lib/admin/ads-exposure/admin-mutation-confirm-copy.ts:45-62` | 같음 |
| PB-44 | 거래 만료 | 기간이 지난 active 주문을 cron 이 `expired` 로 바꾼다 | 계약 §7b · full-audit 「만료 cron」 | `vercel.json:77` · 운영 `expire_trade_promotion_orders` | 같음 |
| PB-45 | 커뮤니티 만료 | (만료 처리 규칙 없음 → PB-C3) | full-reaudit R-06 | pg_cron 없음(운영 확인) · cron 은 거래만 | 확인 못 함 — 지난 주문이 `active` 로 남는다. 노출·결제는 기간으로 걸러진다 |
| PB-46 | 거래 글 판매완료 | 주문을 종료한다(`listing_sold`, 회원 귀책, 환급 0). 종료일을 그 시각으로 당긴다 | lifecycle 설계 §2-1 (운영 적용됨) | 운영 트리거 `trg_posts_zz_trade_promotion_sync` → `trade_promotion_sync_listing` · `trade_promotion_listing_verdict` | 같음 |
| PB-47 | 거래 글 판매자·관리자 삭제 | 종료한다(`listing_owner_deleted` / `listing_admin_deleted`, 환급 0) | lifecycle §2-1 · B-15 | 같은 함수 | 같음 |
| PB-48 | 거래 글 숨김 | 일시정지(`listing_owner_hidden`·`listing_admin_hidden`)하고, 다시 보이면 자동 재개 + 멈춘 시간만큼 연장한다. 관리자 일시정지는 자동 재개하지 않는다 | lifecycle §2-1 | 같은 함수 · `admin_trade_promotion_resume` (`listing_paused` 거부) | 같음 |
| PB-49 | 거래 심사 중 신청 + 판매완료·삭제 | 보류를 풀고 취소한다(차감 없음) | lifecycle v2 B-7 | `trade_promotion_sync_listing` pending_review 분기 | 같음 |
| PB-50 | 관리자 재개 시 글 상태 | 판매완료·삭제면 종료하고, 숨김이면 숨김 대기로 바꾼다 | lifecycle v2 | 운영 `admin_trade_promotion_resume` | 같음 |
| PB-51 | 커뮤니티 글 관리자 숨김·삭제 | 관리자가 정한 귀책으로 종료하고 종료 알림을 보낸다 | (커뮤니티 연동 계약 없음 · 코드 동작만) | `lib/admin/community-admin/community-post-admin-patch.ts:283-309` | 확인 못 함 — 규칙 문서 없음 (PB-C4) |

#### 어드민 (이 영역의 조치·권한·사유·감사)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PB-52 | 상위노출 가격 화면 | 사유 필수로 저장한다. 다른 관리자가 먼저 저장했으면 409 로 다시 그린다(덮어쓰기 없음). 아래에 변경 내역을 보인다 | price-sold-window §1-2 | `components/admin/trade-ad-policies/AdminMemberPromotionProductsPage.tsx:18,128-135,259-273` | 같음 |
| PB-53 | 커뮤니티 가격 수정 권한 | 커뮤니티 행은 `requireCommunityAdmin("promotion")` 를 요구한다 | full-audit A-2 | `app/api/admin/member-promotion-products/route.ts:143-145` | 같음 (서버) |
| PB-54 | 가격 저장 버튼 | 권한이 없으면 버튼을 막는다 | full-reaudit N-09 | `AdminMemberPromotionProductsPage.tsx:191,235` (`locked` 에 권한 조건 없음) | 다름 — 버튼은 켜지고 서버가 403 을 준다 |
| PB-55 | 거래 상위노출 조치 | 승인·반려·정지·재개·종료를 DB 함수 1개로 처리한다(감사 `trade_promotion_audit`). 종료는 귀책 필수 + 환급 미리보기 | trade-promotion-admin 주석 · H-1 | `lib/admin/trade-admin/trade-promotion-admin.ts:18-74` · `app/api/admin/trade/promotions/[id]/route.ts:32-38` | 같음 |
| PB-56 | 커뮤니티 상위노출 조치 | 정지·재개(L2 사유)와 종료(귀책·사유·미리보기)를 하고 종료 알림을 보낸다 | `community-promotion-orders/[id]/route.ts:11-19` | `app/api/admin/community-promotion-orders/[id]/route.ts:26` · `lib/admin/community-admin/community-promotion-order-action.ts:106` | 같음 |
| PB-57 | 거래 주문 목록 조회 권한 | (모든 활성 관리자 · Owner O-2) | trade-admin-guards O-2 | `app/api/admin/trade-promotion-orders/route.ts:12` (`requireAdminApiUser`) | 같음 — 모든 활성 관리자가 같은 권한 |
| PB-58 | 고객 알림 문구 | 거래 「상위노출이 종료되었습니다」(환급이면 「{N}P가 환급되었습니다」) · 커뮤니티 「게시글 상위노출이 종료되었습니다」. 「홍보」를 쓰지 않는다 | double-check S-2 | `lib/i18n/catalog/notifications.ts:264,291` | 같음 — 알림 항목 이름 「커뮤니티 홍보 종료」「거래글 홍보 심사」는 남아 있다 (`lib/notifications/notification-item-registry.ts:242,334`, 고객 노출 여부는 확인 못 함) |

#### 근거끼리 충돌 · 근거 없음(Owner 결정 필요)
| ID | 내용 | 충돌하는 근거 둘 | 권장 |
|---|---|---|---|
| PB-C1 | 커뮤니티 표기 「광고」 ↔ 「포인트 노출」 | promotion 계약 §7b O-1 「커뮤니티 카드 표기 = 「광고」」, master 계약 §1 CTA copy 「badge 「광고」」 ↔ master 계약 §1 「커뮤니티 상위노출 표시(11-04)」 · Owner 11-04 확정 | promotion 계약 §7b O-1·O-3 줄을 11-04 결정으로 정정한다(코드는 이미 11-04 기준) |
| PB-C2 | 광고 표기 규정 ↔ 「포인트 노출」 | O-1 이유(공정위·Apple 2.5.18 「광고」 표기) ↔ Owner 11-04 「광고 → 포인트 노출」 | Owner 가 확정했으므로 바꾸지 않는다. 규정 위험만 기록한다(Owner 결정 사항) |
| PB-C3 | 커뮤니티 주문 만료 처리 | 근거 없음 — 거래만 cron 이 있다. 지난 주문이 active 로 남아 어드민 상태가 실제와 다르다 (R-06) | 거래와 같은 만료 함수·cron 을 커뮤니티에 둘지 Owner 결정 |
| PB-C4 | 커뮤니티 글 회원 삭제·숨김 ↔ 주문 | 근거 없음 — 거래는 트리거로 종료·정지(lifecycle 설계)하지만 커뮤니티는 「범위 밖」(§2-4)이다. 지금은 노출만 빠지고 기간은 흐른다 | 거래와 같은 규칙(삭제 = 종료·환급 0, 숨김 = 정지)을 적용할지 Owner 결정 |
| PB-C5 | 커뮤니티 동네 탭·이웃만 보기의 지역 조건 | 근거 없음 — 거래는 지역 구간 조건(P-3)이 있지만 커뮤니티 규칙은 「홈·주제·동네 탭」이라는 범위만 있다 | Owner 결정. 거래 P-3 과 같은 방향을 권장 |
| PB-C6 | 커뮤니티 광고 20개 상한·운영 고정 글 표기 (R-10) | O-2 「나머지 광고 중인 글은 일반 자리 표시」 ↔ 코드 상한 20 | 상한 없이 표시(규칙대로) |
| PB-C7 | 판매자 창 시각의 시간대 | 시안 「11월 6일 18:00」 · AGENTS §9 PHT(보고·일정 기준) ↔ 고객 화면 시간대 규정 없음 | PHT 고정을 권장. 고객 화면에 AGENTS §9 를 적용할지 Owner 확인 |
| PB-C8 | 관리자 삭제 = 환급 0 | lifecycle 설계 §2-1 「관리자 삭제 = 회원 귀책」 ↔ 운영 귀책 비례 환급 규칙(§7b) | 지금 설계대로 둔다. 운영자 실수는 관리자 지급으로 처리 — 설계에 이미 적혀 있다 |
| PB-C9 | 글 상태 연동 종료·만료 때 회원 알림 | 근거 없음 — 관리자 종료만 알림이 있다. 트리거 종료(판매완료·삭제)·숨김 정지·만료는 알림이 없다 | Owner 결정. 확인창 안내(PB-33)로 대신한다면 지금대로 |
| PB-C10 | 시안의 광고 카드 테두리 | 시안 `.card.ad { outline }` ↔ v5 카드 「칩 1개」 규칙 | 승인 전 시안이라 칩만(지금 코드)을 유지한다. 확인 못 함 |
| PB-C11 | 동네 조건 없는 `/api/trade/feed` · 지역 조건 없는 시드 (PB-9·PB-10) | 계약 §7b 「목록 함수와 같은 구간 계산」 ↔ 두 경로 구현 | 목록 API 와 같게 맞춘다(R-11 이월 항목) |
| PB-C12 | 거래 심사 중 중복 (PB-39) | 계약 §2 「심사 중 = 409」 ↔ 거래 DB 함수 | 승인형 상품을 켜기 전에 DB 함수에 `pending_review` 를 추가한다(운영 DB 승인 필요) |

**NOT_PROVEN**: 모든 화면 판정(Production·Owner 휴대폰·로그인 상태·화면 크기). 운영에 광고 중인 주문이 0건이라 실제 목록 순서·배경·칩·연장·환급을 운영 화면으로 재현할 수 없습니다.

**작성 중 확인 못 한 것**: `.../ads-final-double-check-2026-11-03.md` 와 `.../ads-stage3-recommendations-2026-11-03.md` 는 상위노출 관련 부분만 검색해서 읽었습니다. 커뮤니티 인기 탭 노출은 확인하지 않았습니다.

---


### 피드 배너 (거래·커뮤니티 목록 안 배너) — 어드민 직접 등록 · 회원 신청 · 이벤트 배포

이 표는 코드 수준 판정입니다.
- 코드 기준: `/Users/bkkim/projects/samarket-ads-s1` @ `5b832c7d4` (origin/main, 2026-11-04 16:00 PHT)
- 운영 DB: `ckdosyydvgzqwpbwuhon` 에서 SELECT 와 함수 정의 조회만 했습니다. 테스트 DB 는 보지 않았고, 코드·DB 변경과 커밋은 없습니다.

운영 상태(SELECT):
- 지금 노출 중인 캠페인은 **0건**입니다(기간 안의 active 0).
- `feed_ad_events` 는 노출 17건, 클릭 0건입니다.
- 신청 상태: active 2 · ended 41 · rejected 16 · cancelled 1 · pending_review 0
- 보류 포인트: captured 30 · released 30
- 상품: 거래 3일 8000P · 거래 7일 15000P · 커뮤니티 3일 10000P · 커뮤니티 7일 20000P (모두 켜짐)

그래서 고객 화면 판정은 전부 코드 수준이고, Production·Owner 휴대폰 실기는 **NOT_PROVEN** 입니다. 「다름」은 표에 적은 file:line 을 직접 열어 확인했습니다.

근거 약칭:
- HL = `docs/dibay-feed-banner-product-hard-lock.md`
- MC = `docs/dibay-paid-exposure-feed-ad-master-contract.md`
- PC = `docs/dibay-promotion-advertisement-product-contract.md`
- 감사 문서는 `/Users/bkkim/projects/samarket/docs/audit/` 아래에 있습니다.
  - FA = `ads-full-audit-2026-11-03.md`
  - RF = `ads-reaudit-final-2026-11-03.md`
  - DC = `ads-final-double-check-2026-11-03.md`
  - OD = `ads-owner-decisions-2026-11-03.md`
  - ODB = `ads-owner-decisions-db-design-2026-11-03.md`
  - RA = `ads-full-reaudit-2026-11-04.md`

#### 고객 화면
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| FB-C01 | 커뮤니티 「전체」(최신·인기) | 위치는 COMMUNITY_HOME 이고, 후보는 HOME 캠페인과 진행 중인 모든 TOPIC 캠페인이다 | HL §1 Community surface·ALL pool | `lib/community/resolve-community-feed-surface.ts:70-80` · `lib/ads/feed-ad-placement.ts:155-158` | 같음 — 전체 화면 후보에 TOPIC 이 포함된다 |
| FB-C02 | 커뮤니티 주제 탭 | 같은 주제의 TOPIC 캠페인만 나온다. 다른 주제나 HOME 이 섞이지 않는다 | HL §1 TOPIC pool | `feed-ad-placement.ts:160-165` · `resolve-community-feed-surface.ts:46-62` | 같음 |
| FB-C03 | 커뮤니티 「동네」(LOCAL) | 피드 배너가 없다 | HL §1 · §0 Local nav banner No | `resolve-community-feed-surface.ts:38-45` · `CommunityFeed.tsx:476-484` | 같음 — placement 가 null 이면 간격 계획이 0 이다 |
| FB-C04 | 거래 홈 | TRADE_HOME 캠페인만 나온다 | MC §2 Placement | `feed-ad-placement.ts:148-150` · `components/home/HomeProductList.tsx:1271-1279` | 같음 — 카테고리 광고는 홈에 섞이지 않는다(FB-X09) |
| FB-C05 | 거래 카테고리 목록 | 같은 카테고리 id 의 TRADE_CATEGORY 캠페인만 나온다 | MC §2 · PC §7c (카테고리 원본 = `queryTradeHomeRootCategories`) | `feed-ad-placement.ts:142-147` · `components/post/PostListByCategory.tsx:1060-1069` | 확인 못 함 — 대상 목록은 최상위 카테고리뿐인데, 하위 카테고리 화면의 `categoryId` 가 최상위 id 인지 확인하지 못했다 |
| FB-C06 | 커뮤니티 목록(1열) | 광고 사이 글 개수는 4~6개이고 시드로 정해진다. `Math.random` 은 쓰지 않는다 | HL §1 Cadence 4–6 | `lib/ads/feed-ad-slot-policy.ts:11-12,27-31,45-63` | 같음 |
| FB-C07 | 거래 목록(2칸 격자) | 같은 4~6 간격을 쓰되, 광고는 2칸 전체 한 줄이라 줄이 끝난 자리에만 넣는다 | HL §1 Cadence · Geometry(v5 2칸 전체 한 줄) | `lib/trade/marketplace/plan-trade-grid-feed-ads.ts:39-52` | 다름(조건부) — 조건이 `postsSinceAd >= gap && col === 0` 이다. 간격 5는 실제로 6이 되고, 끼운 샘플 카드(1칸)로 짝수·홀수가 바뀌면 7개 이상도 된다. 4~6 고정과 맞지 않는다(FB-X04) |
| FB-C08 | 목록 공통 | 광고는 DB 페이지 행에 넣지 않고 화면에서만 끼운다. 다시 그려도 자리가 같다 | HL §1·§2 Cadence | `feed-ad-slot-policy.ts:40-63` · 각 목록에서 화면이 끼움 | 같음 |
| FB-C09 | 목록 공통 | 화면 세션 id 는 surfaceKey 별로 sessionStorage 에 두고, 컴포넌트가 다시 올라와도 새로 만들지 않는다 | HL §1 Session seed | `lib/ads/feed-ad-session.ts:22-41` | 같음 |
| FB-C10 | 한 자리 | 서로 다른 캠페인을 최대 3개까지 고른다. 해시 + 1시간 단위 + 앞 자리와 반복 방지로 고르는 공정 회전이다 | HL §1 Selector·Multi-advertiser · Owner O-9 (OD) | `feed-ad-placement.ts:233-281` (hourBucket `:250`) | 같음 |
| FB-C11 | 후보 조회 | 후보는 DB 에서 priority 순 50개까지 받는다. 어드민 우선순위는 후보가 50개를 넘을 때만 효과가 있다 | O-9 · DC S-1 F-2 | `lib/ads/feed-ad-campaigns-db.ts:142-156` · 앱 정렬은 id 순 `feed-ad-placement.ts:168` | 같음 |
| FB-C12 | 노출 자격 | status=active 이고 시작 ≤ 지금 < 종료이며, 운영에서 열리는 https 소재가 1개 이상이어야 한다. 기간 만료로 상태를 바꾸는 cron 은 없다 | HL §2 Eligibility read · Sanitation | `feed-ad-placement.ts:105-119,137-141` · `feed-ad-campaigns-db.ts:150-156,191-200` | 같음 |
| FB-C13 | 후보 없음 | 컴포넌트가 null 을 돌려주고 빈 높이를 남기지 않는다 | HL §0·§1 Empty pool | `components/ads/FeedAdBannerCarousel.tsx:155,182` | 같음 |
| FB-C14 | 배너 모양 | 3:1 가로 띠, 콘텐츠 열 최대 768px, cover 로 채운다 | HL §1 Geometry (11-03 정정) | `lib/ads/feed-ad-geometry.ts:35,44,64` | 같음 (PC §7 의 12:5 문서와 충돌 — FB-X02) |
| FB-C15 | 소재 | 캠페인 1개에 소재 1~3장이다. 캠페인이 1개면 소재를 슬라이드로 돌리고, 여러 개면 캠페인마다 대표 소재 1장씩 돌린다 | HL §1 Creatives · Slot items ≠ creative slides | `FeedAdBannerCarousel.tsx:161-187` · `feed-ad-campaigns-db.ts:52-55` | 같음 |
| FB-C16 | 「광고」 표기 | 피드 배너는 「광고」로 표기한다 | MC §1 (2026-11-03 정정) · HL | `FeedAdBannerCarousel.tsx:198,375,379-381` (`ui_home_feed_ad_label`=「광고」) | 같음 |
| FB-C17 | 광고주 이름(거래) | 거래 광고 머리에 광고주 이름을 보여 준다. 회원 광고는 닉네임이고, 내부 코드는 보이면 안 된다 | DC S-1 F-1 · v5 D4 | `FeedAdBannerCarousel.tsx:243,362-377` · `lib/ads/feed-ad-advertiser-name.ts:11-15` · 승인 시 닉네임 `approve-feed-ad-request.ts:161-162` | 다름 — 어드민이 이름을 비우면 「Untitled」가 저장되고(`app/api/admin/feed-ads/route.ts:111`, `lib/ads/update-feed-ad-campaign.ts:50`), 표시 함수가 이 값을 거르지 않는다(RA F-08). 회원이 닉네임을 바꿔도 따라가지 않는다 |
| FB-C18 | 광고주 이름(커뮤니티) | — | 근거 없음 | `FeedAdBannerCarousel.tsx:378-382` (「광고」 칩만 있음) | FB-X08 로 |
| FB-C19 | 점(슬라이드 이동) | 점마다 누르는 영역이 24px 이고 서로 겹치지 않는다 | RF R1 E-2 | `FeedAdBannerCarousel.tsx:383-406` | 같음 |
| FB-C20 | 깨진 이미지 | — (계약 조항 없음. RA F-10 결함으로만 기록) | RA §1-4 F-10 | `FeedAdBannerCarousel.tsx:460-466` → `SamarketThumbnail` 일반 대체 이미지 | FB-X06 로 — 지금은 대체 이미지가 「광고」와 함께 나오고 노출도 기록된다 |
| FB-C21 | 누르기 | 이동 대상은 정해진 형식만 쓴다. 이벤트로 가면 방문 기록을 남긴다 | MC §2 Destination · EVT-05 | `FeedAdBannerCarousel.tsx:46-52,431-458` · `lib/ads/feed-ad-destination.ts` | 같음 |

#### 회원 신청자 화면 (신청 · 마이 › 광고 · 연장)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| FB-M01 | 신청 폼 `/mypage/ads/feed-request` | 회원 1명에게 진행 중 배너는 1개다. 심사 중·예정·진행 중이 있으면 두 번째 신청은 409 이고 보류 0 이다 | HL §1 Member limit · §0 | `app/api/me/feed-ad-requests/route.ts:261-316` · `lib/ads/feed-ad-member-limit.ts:26-35` · 폼 `feed-request/page.tsx:141-147` | 같음 (순차 요청 기준). DB 에는 「회원당 1개」 제약이 없어 동시 요청은 확인 못 함 |
| FB-M02 | 신청 | 같은 Idempotency-Key 를 다시 보내면 기존 신청을 돌려주고 보류는 1번만 한다 | HL §2 Member create · F7 | `route.ts:243-259,418-438` · 운영 고유 색인 `feed_ad_requests_user_idempotency_uidx` | 같음. 폼은 누를 때마다 새 키를 만들지만(`feed-request/page.tsx:440-443`) FB-M01 의 409 가 두 번째 보류를 막는다 |
| FB-M03 | 신청 | 가격·기간은 DB `feed_ad_products` 의 켜진 상품만 쓴다 | HL §2 Price/period · MC PHASE1 | `lib/ads/feed-ad-products.ts:86-95` · `route.ts:238-241,401-402` | 같음 |
| FB-M04 | 신청 | 위치는 4종, 도메인과 일치, 카테고리·주제는 필수, 정렬 전용 주제는 막는다 | MC §2 · PC §7c | `route.ts:318-346` | 같음 |
| FB-M05 | 신청 | 소재는 1~3장이고 운영에서 열리는 https 만 받는다 | HL §1 Creatives · Sanitation | `route.ts:348-376` | 같음 |
| FB-M06 | 신청 직접 저장 | 신청 생성과 보류는 `POST /api/me/feed-ad-requests` 경로로만 한다 | HL §2 Member create + HOLD | 운영 `pg_policies` 에 `feed_ad_requests_insert_own` (INSERT) 있음 | 다름 — 로그인 회원이 보류 없이 행을 직접 넣을 수 있다(RA F-12, 무료 광고는 생기지 않음) |
| FB-M07 | 마이 › 광고 목록 | 상태는 캠페인 상태와 기간을 기준으로 보여 준다(캠페인 종료면 「종료」) | HL §2 Admin queue · presentation 계약 | `lib/ads/feed-ad-member-presentation.ts:69-202` · `route.ts:170-181` | 같음 |
| FB-M08 | 심사 중 취소 | 심사 중일 때만 취소할 수 있고, 취소하면 보류를 환급(RELEASE)하고 cancelled 가 된다 | HL §1 Financial · §2 cancel | `lib/ads/cancel-feed-ad-request.ts:34-53` · `MyAdsPageClient.tsx:688-703` | 같음 |
| FB-M09 | 반려 사유 | 반려되면 사유를 회원에게 보여 준다 | MC §4 (거절 상태) | `MyAdsPageClient.tsx:683-687` | 같음 |
| FB-M10 | 연장 버튼 | 관리자가 정지·종료한 광고는 연장 버튼이 없고, 서버도 409 를 준다. 기간이 끝나 저절로 끝난 광고(active)는 연장할 수 있다 | Owner 결정 1 (RA §5) | `MyAdsPageClient.tsx:614-615` · `route.ts:55` · `renew-feed-ad-campaign.ts:126-134` · `feed-ad-member-presentation.ts:262-267` | 같음 |
| FB-M11 | 회원 자발 정지와 관리자 정지 구분 | 두 정지를 구분한다 | Owner 결정 1 | `feed-ad-member-presentation.ts:257-261` (「회원 정지 기능이 없으니 paused = 관리자」) | 다름(설계 간접) — 누가 멈췄는지 저장하는 칸이 없고 상태값으로 미루어 정한다. 회원 정지 기능이 생기면 바로 섞인다 |
| FB-M12 | 관리자 정지·종료 안내 | — | Owner 결정 1 은 「사유·이력 보존」만 정함. 회원에게 보여 줄지는 근거 없음 | `MyAdsPageClient.tsx:683` (반려만 사유 표시) · 연장 거절 문구 `:336-342` | FB-X07 로 |
| FB-M13 | 연장 재시도 | 같은 결제 시도는 같은 요청 키를 쓴다(응답이 끊긴 뒤 다시 눌러도 두 번 차감되지 않아야 한다) | DC S-0 X-1 · RA R-01 원칙 | `app/(main)/mypage/ads/MyAdsPageClient.tsx:315-318` (누를 때마다 `randomUUID`) | 다름 — 응답이 끊긴 뒤 다시 누르면 새 키로 **한 번 더 차감되고 한 번 더 연장**된다. S-0 의 4개 화면에 피드 배너 연장은 없었다 |
| FB-M14 | 연장 오류 문구 | 자리 없음·관리자 차단·재심사 필요를 한국어로 안내하고, 서버 코드 원문은 보이지 않는다 | DC S-2 · AGENTS UI 문구 | `MyAdsPageClient.tsx:333-366` | 같음 |
| FB-M15 | 연장 소재 변경 | 소재·연결을 바꾸면 연장이 아니라 새 신청(재심사)이다 | HL §2 Renewal | `renew-feed-ad-campaign.ts:75-77` · UI 는 항상 false `MyAdsPageClient.tsx:330` | 같음 |
| FB-M16 | 신청 시점 자리 현황 | — | 근거 없음 | 신청 API 에 자리 검사 없음 `route.ts:201-474` | FB-X10 로 |

#### 돈 규칙 (보류 · 승인 차감 · 반려 환급 · 연장 결제 · 연장 실패 환급 · 자리 없음 · 동시 승인)
| ID | 단계 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| FB-P01 | 신청 = 보류 | 신청하면 잔액에서 보류(HOLD)로 차감하고 원장 `ad_hold`, 보류 행 held 를 남긴다. 보류 행 저장이 실패하면 되돌린다 | MC §2 · HL §1 Financial | `lib/ads/feed-ad-request-point-flow.ts:24-77` · 실패 시 신청 삭제 `route.ts:456-467` | 같음 |
| FB-P02 | 승인 = 확정 | 순서는 초안 캠페인·소재 저장 → 보류 확정(CAPTURE) → 진행 중이다. 저장 전에 확정하지 않고, 확정 없이 진행 중으로 두지 않는다 | MC §2 PHASE1 LOCK · HL §2 Approve | `lib/ads/approve-feed-ad-request.ts:164-257` · 확정 `point-flow.ts:123-165` | 같음 |
| FB-P03 | 승인 후 활성화 실패 | 보류를 돌려주고 초안을 지운다 | MC §2 PHASE1 | `approve-feed-ad-request.ts:245-257,275-298,302-313` | 같음 |
| FB-P04 | 반려 = 환급 | 보류 환급(RELEASE)과 rejected 를 DB 함수 한 트랜잭션에서 처리하고, 같은 보류를 두 번 환급하지 않는다 | HL §2 Reject · RF H-2 | 운영 `admin_reject_feed_ad_request` (환급 원장 `release:<hold>` 중복 확인) · `lib/ads/admin-reject-feed-ad-request.ts` | 같음 |
| FB-P05 | 연장 결제 | 연장은 원장 결제(`ad_purchase`, `renew:<캠페인>:<키>`)이고, 지금과 현재 종료일 중 늦은 쪽부터 기간을 더한다 | HL §1 Financial · §2 Renewal | `renew-feed-ad-campaign.ts:249-266` · `feed-ad-member-presentation.ts:241-254` | 같음 |
| FB-P06 | 연장 실패 환급 | 차감했는데 연장이 안 되면 같은 환급 id 로 1번만 환급한다. 차감 뒤 재시도에서 「자리 없음」이 확정돼도 실제 차감액을 환급한다 | RF R1/HL 재무 · RA §5 F-04 | `renew-feed-ad-campaign.ts:191-231,266-281` | 같음 |
| FB-P07 | 자리 없음 — 서버 미리 검사 | 자리는 「위치 + 업종/주제」마다 3개다. 승인·어드민 진행 중 등록·끝난 광고 연장 전에 자리를 확인하고, 가득 차면 차감하거나 승인하지 않는다 | OD S-3 · DC S-1 F-3 | `lib/ads/feed-ad-pool-capacity-server.ts:15-49` · 승인 `approve-feed-ad-request.ts:131-136` · 등록 `app/api/admin/feed-ads/route.ts:99-106` · 연장 `renew-feed-ad-campaign.ts:235-247` | 같음 |
| FB-P08 | 자리 없음 — DB 최종 판정 | 트리거가 같은 풀을 잠근 뒤 세고, 4번째를 막는다(`feed_ad_pool_capacity_full`) | OD S-3 (운영 적용 PASS) | 운영 `feed_ad_campaigns_pool_capacity_guard` (`pg_advisory_xact_lock` · 종료·반려·초안·기간 지난 행 제외) | 같음 (동시 실행 자체는 NOT_PROVEN) |
| FB-P09 | 동시 승인에서 진 신청 | — (규칙 없음. 결함 F-03 으로 기록) | RA §1-4 F-03 | `approve-feed-ad-request.ts:245-251` (포인트 보상 후 `unclaimReview` → pending_review 로 남음) | 다름(결함 남음) — 포인트는 돌려줬는데 신청은 「검토 중」에 남는다. 다시 승인하면 `hold_missing`(`point-flow.ts:131-136`)으로 500 이 난다 |
| FB-P10 | 승인 전 검사에서 자리 없음 | 가득 차면 승인하지 않고 보류는 그대로 둔다 | DC S-1 F-3 주석 | `approve-feed-ad-request.ts:131-136` | 같음 (보류는 어드민이 반려해야 풀린다) |
| FB-P11 | 어드민 종료 | 종료해도 자동 환급하지 않는다(CAPTURE 로 정산 끝) | HL §2 · `ADMIN_END_REFUND_POLICY_REQUIRED` | `lib/ads/end-feed-ad-campaign.ts:1-12` · 응답 `refund:false` `feed-ad-requests/[id]/route.ts:376-381` | 같음 (상위노출 운영 종료 = 비례 환급과 다르다 — FB-X05) |
| FB-P12 | 보상 연장 | 어드민 무료 연장은 1~90일이고, 사유가 필수이며 포인트 차감이 없다 | HL §2 Paid renew vs admin | `lib/ads/admin-compensate-extend-feed-ad-campaign.ts:28-35,69-79` | 같음 |
| FB-P13 | 원장 쓰기 | 원장에 직접 INSERT 하거나 잔액을 고치지 않고 `spend/credit` 함수만 쓴다 | HL §3 | `point-flow.ts:31-38` · `renew-feed-ad-campaign.ts:249-257` | 같음 (반려 DB 함수는 원장 INSERT 와 `project_user_point_balance_from_ledger` 를 쓰는데, 이것이 정본 DB 경로다) |

#### 노출·클릭 집계
| ID | 항목 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| FB-E01 | 노출 기준 | 화면에 50% 이상, 1초 이상 보이면 노출 1회다(지금 보이는 슬라이드 기준, 앱이 백그라운드면 세지 않음) | HL §0 O-4 · ODB O-4 | `lib/ads/feed-ad-event-client.ts:8-9` · `FeedAdBannerCarousel.tsx:265-299` | 같음 |
| FB-E02 | 클릭 | 이동하기 전에 keepalive 로 보내고 기다리지 않는다 | ODB O-4 웹 | `FeedAdBannerCarousel.tsx:441-450` · `feed-ad-event-client.ts:29-44` | 같음 |
| FB-E03 | 보는 사람 판정 | 보는 사람은 서버가 정한다(회원 id, 비로그인은 IP 해시). 앱이 보낸 세션·자리 값은 믿지 않는다 | ODB O-4 「앱이 보낸 값을 믿지 않음」 · RA §5 F-01 | `app/api/feed-ads/events/route.ts:41-54` · `lib/ads/feed-ad-viewer-key.ts:10-15` (자리 `p_slot_ordinal: 0`) | 같음 (HL §0 의 키 정의 문구와 충돌 — FB-X03) |
| FB-E04 | 1시간 1회 | 캠페인 + 소재 + 보는 사람 + 1시간이 같으면 1행만 남기고, 새 행일 때만 숫자를 +1 한다 | HL §0 · ODB O-4 | 운영 `record_feed_ad_event` (md5 키 · `ON CONFLICT DO NOTHING` · 새 행만 `impression_count`/`click_count` +1) | 같음 |
| FB-E05 | 클릭 ≤ 노출 | 클릭을 기록하기 전에 같은 사람의 노출을 먼저 기록한다 | RA §5 F-01 | `events/route.ts:56-61` | 같음 |
| FB-E06 | 기록 대상 | 노출 중인 캠페인과 그 캠페인 소재만 기록한다 | HL §0 | 운영 `record_feed_ad_event` (`not_live` · `creative_mismatch`) | 같음 |
| FB-E07 | 소재 없이 보낸 기록·위치 값 | — (결함 F-02 로 기록) | RA §1-4 F-02 | 운영 함수: 소재가 비면 키 `'-'` 로 별도 행 · `p_placement` 검사 없음 · `events/route.ts:50` | 다름(결함 남음) — 소재 id 를 빼고 보내면 같은 사람이 1시간에 1번 더 셀 수 있다 |
| FB-E08 | 캠페인 숫자 의미 | — (F-11: 소재 3개 캐러셀은 한 번 보면 최대 3으로 센다, 화면 안내 없음) | RA §1-4 F-11 | 키에 소재 id 포함(운영 함수) · `FeedAdBannerCarousel.tsx:277-292` | FB-X11 로 |
| FB-E09 | 어드민 숫자 | 어드민 피드 배너 목록과 회원 신청 상세에 노출·클릭 숫자를 보여 준다 | HL §0 O-4 | 목록 `lib/admin/ads-control-plane/project-family-rows.ts:440-443` · 상세 `app/api/admin/feed-ad-requests/[id]/route.ts:193-194` · `components/admin/ads/AdminFeedAdRequestDetail.tsx:690` | 같음 (운영 클릭 0 · 노출 17, 실제 화면 NOT_PROVEN) |

#### 어드민 (등록 · 수정 · 정지 · 재개 · 종료 · 승인 · 반려 · 보상 연장 · 자리 현황 · 숫자 · 감사)
| ID | 기능 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| FB-A01 | 권한 | 피드 배너 쓰기(등록·수정·승인·반려·종료·정지·상품)는 `ads` 권한이다 | FA A-1 · RF | `app/api/admin/feed-ads/route.ts:39` · `[campaignId]/route.ts:37` · `feed-ad-requests/[id]/route.ts:260` | 같음 |
| FB-A02 | 직접 등록 | `source=ADMIN_DIRECT` 이고 포인트 차감 0이며, 회원 신청과 분리한다 | MC §3 · HL §1 boundary C | `feed-ads/route.ts:110-127` | 같음 |
| FB-A03 | 대상 선택 | 카테고리·주제는 정본 목록에서 고르고, UUID·slug 직접 입력은 금지다 | PC §7c | `app/api/admin/feed-ads/targets/route.ts` · `app/api/me/feed-ad-targets/route.ts:25-26` | 같음 (경로만 확인) |
| FB-A04 | 승인·반려·종료·보상 연장 사유 | 사유는 필수(2자 이상)이고 감사 기록에 남긴다 | RF R2 · Owner 결정 1 「관리자 사유 보존」 | `feed-ad-requests/[id]/route.ts:292-299` · 허브 `advertising-workspace/action/route.ts:120-139` | 같음 |
| FB-A05 | 정지·재개 사유 | 관리자 사유를 보존한다 | Owner 결정 1 | 도메인 `feed-ad-requests/[id]/route.ts:294` (pause/resume 은 필수 목록에 없음) · 허브 `action/route.ts:130-135` (feed 제외) · 빈 사유는 `"admin_paused"` 코드 저장 `pause-resume-feed-ad-campaign.ts:88` | 다름 — 피드 배너 정지·재개는 사유 없이 처리된다 |
| FB-A06 | 조치 이력 | 관리자 사유·이력을 보존한다 | Owner 결정 1 | `admin_memo` 를 조치마다 덮어씀 `pause-resume-feed-ad-campaign.ts:94,153` · `end-feed-ad-campaign.ts:107` · `admin-compensate-extend…ts:76` · 이력은 `audit_logs` 에만 남음 | 일부 다름 — 캠페인 행에는 마지막 사유만 남는다. 감사 기록에 before 값이 없다(RA N-05) |
| FB-A07 | 감사 이름 | 같은 조치는 같은 감사 이름을 쓴다 | RA N-05 (결함) | 도메인 `feed_ad_request.approve` `feed-ad-requests/[id]/route.ts:335` ↔ 허브 `feed_ad.approve` `action/route.ts:269` | 다름(결함 남음) |
| FB-A08 | 종료 | 캠페인을 ended 로 바꾸고 end_at=지금으로 하며, 연결된 신청도 ended 로 맞춘다 | HL §2 Campaign end → request | `end-feed-ad-campaign.ts:101-135` · `lib/ads/sync-feed-ad-request-ended.ts:51-68` | 같음 |
| FB-A09 | 정지·재개 | 정지하면 노출에서 빠진다. 재개는 기간 안일 때만 된다. 기간은 바꾸지 않는다 | `pause-resume-feed-ad-campaign.ts:1-5` (코드 계약) | `pause-resume-feed-ad-campaign.ts:83-101,137-160` | 같음 (멈춘 동안에도 기간이 흐름 — FB-X05) |
| FB-A10 | 보상 연장·수정이 자리 없음으로 막힐 때 | 「자리 없음」을 한국어로 안내한다(다른 경로와 같게) | RA F-06 (결함) | `admin-compensate-extend-feed-ad-campaign.ts:80` · `update-feed-ad-campaign.ts:104` (원문 `error.message` 500) | 다름(결함 남음) |
| FB-A11 | 자리 현황(위치 지도) | 자리를 「위치 + 업종/주제」로 세서 서버·트리거와 같은 숫자를 보여 준다 | OD S-3 「서버 검사·등록 화면 같은 키」 | 등록 화면은 같은 키 `AdminFeedAdCreatePage.tsx:160-190` · 위치 지도는 위치만 셈 `lib/admin/ads-exposure/placement-inventory.ts:205-221` | 다름 — 위치 지도가 업종·주제를 합쳐 센다(RA F-07) |
| FB-A12 | 회원 신청 소재 교체 | 승인하려면 소재가 저장돼 있어야 하고, 큐에서만 승인하는 것은 금지다 | HL §2 Admin creative replace | `feed-ad-requests/[id]/route.ts:546~` (`replace_creative`) · 승인 시 소재 검사 `approve-feed-ad-request.ts:98-123` | 같음 |
| FB-A13 | 어드민 목록 상태 | 「광고중」은 캠페인 상태 + 기간으로 정하고, 신청 행의 active 를 쓰지 않는다 | HL §2 Admin queue filter | `project-family-rows.ts:409-412` (`feedCampaignOpsStatus`) | 같음 |
| FB-A14 | 이벤트 배너 끄기 | 끄면 종료(ended)로 바꿔 자리를 비우고, 다시 켜면 같은 캠페인이 active 가 된다(트리거가 자리 검사) | RA §5 F-05 · OD QA 배너 종료 | `lib/platform-promotion-distribution/save-event-distribution.ts:94-99,195-208,250-263` | 같음 |
| FB-A15 | 이벤트 배너 수정 | 어드민 등록 내용(이미지)과 앱이 1:1 로 맞아야 한다 | AGENTS.md 허위·추측 금지 §4 | 처음 만들 때만 소재를 넣음 `save-event-distribution.ts:236-245` · 수정 경로 `:249-263` 는 캠페인 칸만 바꿈 | 다름 — 이벤트 배너 이미지·제목을 바꿔도 기존 피드 소재는 그대로다 |
| FB-A16 | 이벤트 배너 광고주 이름 | 고객에게 「Event banner ·」 접두어가 보이지 않는다 | DC S-1 F-1 | `feed-ad-advertiser-name.ts:9,14` | 같음 |
| FB-A17 | 남은 QA 행 | — | RA W-6 | 운영: ADMIN_DIRECT paused 9건은 모두 기간이 지나 자리를 차지하지 않는다 | 확인 — 지금 자리 점유 0 |

#### 근거끼리 충돌 · 근거 없음 (Owner 결정 필요)
| ID | 내용 | 충돌하는 근거 둘 | 권장 |
|---|---|---|---|
| FB-X01 | 피드 배너 「광고」 표기 | PC §7 「top_fixed… **not** Feed「광고」」 ↔ MC §1 11-03 정정 「유료 노출·피드 광고 모두 「광고」」 | MC 정정을 정본으로 하고 PC §7 문구를 고친다 |
| FB-X02 | 배너 비율·높이 | PC §7 「12:5 strip」·MC §6 「outer width = host list item width · Slot=4」 ↔ HL §1 「3:1 · 4~6 · 2칸 전체 한 줄」 | HL 을 정본으로 하고 PC §7·MC §6 을 고친다 |
| FB-X03 | 노출 중복 방지 키 | HL §0 「캠페인+소재+**화면 세션+자리 번호**+1시간」·ODB 같음 ↔ RA §5 F-01 수정 「보는 사람(회원/IP 해시)+자리 0」 | F-01 구현을 정본으로 하고 HL §0 문구를 고친다 |
| FB-X04 | 거래 격자 간격 | HL §1 「4–6」 ↔ `plan-trade-grid-feed-ads.ts:44` 줄 끝 맞춤(6·7 이상 가능) | 「거래는 4~6 이상, 줄이 끝나는 첫 자리」로 계약 문구를 고칠지 Owner 결정 |
| FB-X05 | 관리자 정지·종료 시 기간·돈 | 피드: 정지 중에도 기간이 흐르고 종료 환급 없음(`ADMIN_END_REFUND_POLICY_REQUIRED`) ↔ 상위노출: 재개하면 멈춘 시간만큼 연장, 운영 종료 = 비례 환급(RF E-14 · PC §7b) | 회원 유료 배너도 상위노출과 같게(정지 시간 보전 · 운영 귀책 종료 비례 환급) — 재무 잠금 재오픈 필요 |
| FB-X06 | 깨진 이미지 | 근거 없음 (RA F-10 결함만 있음. 팝업 계약은 「이미지 로드 후 노출 기록」) | 이미지가 실패한 소재는 숨기고 다음 소재·캠페인으로 넘긴다. 노출은 이미지를 띄운 뒤에 센다 |
| FB-X07 | 관리자 정지·종료 사유를 회원에게 보여 줄지 | Owner 결정 1 은 「사유·이력 보존」만 정함 | 「운영자가 멈춤/종료」 상태와 공개용 사유 1줄을 보여 준다(내부 메모와 분리) |
| FB-X08 | 커뮤니티 배너 광고주 이름 | 근거 없음 (v5 D4 는 거래만) | 거래와 같게 광고주 이름 + 「광고」 |
| FB-X09 | 거래 홈에 카테고리 광고를 섞을지 | 커뮤니티 전체 = HOME+TOPIC(HL §1) ↔ 거래 홈 = HOME 만(코드). 거래 규칙 근거 없음 | 지금대로(판매 지면 분리). 계약에 거래 홈 후보 규칙을 적는다 |
| FB-X10 | 신청할 때 자리 현황을 알려 줄지 | 근거 없음. 지금은 가득 차도 신청·보류가 되고, 승인 때 막힌다(FB-P10) | 신청 화면에 「지금 남은 자리」를 보여 주고, 가득 차면 신청을 막는다(보류 전에) |
| FB-X11 | 캠페인 노출 수 정의 | 근거 없음 (F-11) | 「소재별 노출 합」이라고 어드민 숫자 옆에 적는다. 또는 캠페인 기준 키로 바꿀지 결정 |
| FB-X12 | 비로그인 같은 IP 묶음 | 근거 없음 — 이동통신 NAT 처럼 IP 를 나눠 쓰면 여러 사람이 1명으로 센다 | 지금대로 두고 어드민에 「비로그인은 IP 기준」 안내 |
| FB-X13 | 관리자 종료 뒤 새 신청 | Owner 결정 1 「결제·연장·재개로 우회 불가」에 새 신청(재심사)이 포함되는지 불명 · 지금은 「다시 광고 만들기」로 새 신청 가능(`MyAdsPageClient.tsx:704-712`) | 새 신청은 어드민 심사를 다시 거치므로 허용한다 — Owner 확인 필요 |
| FB-X14 | 광고 기간 시작 시점 | 근거 없음 — 지금은 승인 순간부터 기간이 시작된다(`approve-feed-ad-request.ts:125-127,178-179`) | 지금대로. 회원 화면에 「승인 시점부터」 안내 |
| FB-X15 | 검색 결과 목록 안 피드 배너 | 근거 없음 (상위노출은 「검색어가 있으면 배지만」 PC §7b) · 거래 홈 간격 계획이 검색어 조건과 무관한지 확인 못 함 | 상위노출과 같게 검색 결과에는 끼우지 않는다 — 코드 확인 후 결정 |

남은 위험 3가지:
1. FB-M13 피드 배너 연장 재시도 두 번 차감 — 돈 결함, 계획에 없음.
2. FB-P09 동시 승인에서 진 신청이 「검토 중」에 갇힘.
3. FB-A15 이벤트 배너 이미지 수정이 앱에 반영되지 않음.

모두 지금 운영에 노출 중인 광고가 0건이라 실제 피해 기록은 없습니다(실기 NOT_PROVEN).

---


### 전역 팝업(운영자·사장님 신청) + PTR 띠 광고

**범위·조건.** 읽기 전용으로 작업했습니다. 확인한 코드는 `/Users/bkkim/projects/samarket-ads-s1`(`5b832c7d4`, origin/main detached)입니다. 운영 DB `ckdosyydvgzqwpbwuhon` 에는 SELECT 1회만 실행했습니다(2026-11-04 16:09 PHT). 판정은 모두 **코드 수준**입니다. 화면·실기기·Owner 휴대폰은 보지 않았으므로 **NOT_PROVEN** 입니다.

**운영 현황.** 기간 안에서 승인·active 인 운영자 팝업이 3건, PTR 이 2건 있습니다(모두 `once_per_session`). 11-03 감사 시점의 「노출 0」과 다릅니다. 무엇 때문에 켜졌는지는 확인하지 못했습니다(실기 시험용으로 추정만 가능).

**새로 찾은 것 (코드를 직접 열어 확인).**
- **PT-07**: PTR 띠는 **전체가 한 개의 버튼**입니다(`components/ptr/DibayPtrRevealBand.tsx:105-110` `absolute inset-0`). CTA 칩(`:148-151`)은 그림일 뿐입니다. O-8 은 「지금 버튼(CTA)만 눌린다 → 지금대로」로 결정했지만, 그 전제가 코드와 다릅니다. R-7 지적(띠 전체가 탭 영역)도 그대로 남아 있습니다.
- **PU-30 (P-01 미해결)**: 팝업 CTA 이동 뒤에 dismiss/suppress 이벤트도 기록됩니다(`GlobalPopupHost.tsx:543` → `:435-446`). 정본 PTR 문서 §11.2 는 「CTA 로 끝난 노출은 click 이 종료, dismiss 없음(팝업과 동일)」입니다.

#### 고객 화면 — 팝업
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PU-01 | 영역 | 「전체」는 커뮤니티·거래·배달·내정보 4곳이다 | 팝업 lock §3, 머리 정정(G-3) | `lib/platform-popup/types.ts:107-112`, `surfaces.ts:17-26` | 같음 — GLOBAL 확장에 4개만 있음 |
| PU-02 | 영역 | 배달 사장님(DELIVERY_OWNER)·어드민 화면은 어드민이 직접 골랐을 때만 띄운다 | G-3 결정, 프로그램 SSOT PLACEMENT | `types.ts:92-99`, `resolve-dibay-surface.ts:75,87-95` | 같음 |
| PU-03 | 제외 화면 | 메신저·통화·결제·주문 핵심 화면에는 띄우지 않는다 | lock §3·§6 | `resolve-dibay-surface.ts:35-55,77-110`, `popup-runtime-context.ts:69-77` | 같음 — 경로와 통화·결제 플래그 둘 다 막음 |
| PU-04 | 우선순위 | 영역 지정 > 전체 → 우선순위 → 덜 본 팝업 → 시작 시각 → id | lock 머리 정정(G-4) | `popup-rotation.ts:22-43` | 같음 |
| PU-05 | 한 번에 1개 | 결과는 0개 또는 1개다. 닫은 직후 다른 팝업을 바로 잇지 않는다 | lock §6 | `resolve/route.ts:80-138`, `GlobalPopupHost.tsx:216-217,274-287,331` | 같음 — 화면을 옮겨야 잠금이 풀림 |
| PU-06 | 1위 무효 | 1위가 표시 단계에서 무효면 그 캠페인만 빼고 다음 순위를 쓴다 | O 결정 S-3 「1위 무효 다음 순위」 | `resolve/route.ts:75-138` | 같음 |
| PU-07 | 닫은 팝업 | 닫은·이동한 팝업은 exclude 로 보내 다음 순위를 받는다 | E-7 | `GlobalPopupHost.tsx:347-350`, `resolve/route.ts:41-47,67` | 같음. 단 exclude 는 최대 50개(P-07, `fetch-platform-popup-resolve-client.ts:19`) |
| PU-08 | 「광고」 표기 | 소재 위에 화면에 보이는 「광고」를 둔다 | G-12, Apple 2.5.18 | `primitives/PopupCreativeMedia.tsx:68-74` | 같음(코드). 실제 모양은 NOT_PROVEN |
| PU-09 | 노출 시점 | 노출(impression)은 이미지 load + 2프레임 + 화면 전면일 때 1회만 센다. 조회 응답은 노출이 아니다 | lock §7, ANALYTICS_SSOT | `DibayPopupAd.tsx:122-167`, `resolve/route.ts:25-28` | 같음 |
| PU-10 | 이미지 로드 전 | (팝업 틀을 이미지 로드 전에 보여도 되는지) | 근거 없음 → 충돌표 PU-C4 | `DibayPopupAd.tsx:237-254` — 이미지 로드 전에 오버레이 마운트 | 확인 못 함 |
| PU-11 | 깨진 이미지 | 깨진 소재 캠페인은 이번 실행 동안 빼고, 조회를 반복하지 않는다 | P-a 결정 | `GlobalPopupHost.tsx:300,349,561-565` | 같음 |
| PU-12 | 가로 화면 | 가로 화면에서는 띄우지 않는다 | 감사 §5 PASS(계약은 「landscape NOT LOCKED」) | `GlobalPopupHost.tsx:70-85,124`, `popup-runtime-context.ts:55` | 코드는 차단. 근거 충돌 → PU-C3 |
| PU-13 | 다른 창 열림 | 확인창·바텀시트 등 다른 오버레이가 열려 있으면 보류한다 | lock §6(critical dialog), G-8 | `GlobalPopupHost.tsx:120-122,165` | 다름(일부) — `TradeChatEntryCreatingOverlay`·`OAuthProviderLoginPanel` 에 `useRegisterOpenOverlay` 없음(grep 0, P-10) |
| PU-14 | 앱 준비 | 시작·로그인 복원·권한·주소 확인 중에는 보류한다 | lock §6 3단계 | `popup-runtime-context.ts:52-53,65-67`, `GlobalPopupHost.tsx:132-142` | 같음(코드). 인트로와의 순서는 NOT_PROVEN |
| PU-15 | 닫기 | 닫기는 떠 있는 × 하나다. 아래 「오늘 하루 보지 않기」 줄은 기본으로 없다 | 프로그램 SSOT DISMISS, G-1·G-2 | `popup-suppression-ui.ts:18-27`(opt-in 없으면 []), `build-presentation-winner.ts:93-97` | 같음 |
| PU-16 | 자동 닫힘 | 자동으로 닫지 않는다(카운트다운 없음) | lock §5 | 타이머 없음(`DibayPopupAd.tsx` 전체) | 같음 |
| PU-17 | Android 뒤로가기 | 뒤로가기·ESC·배경 탭은 × 와 같은 닫기 경로를 탄다 | 프로그램 SSOT DISMISS | `DibayPopupAd.tsx:239-251`(DibayOverlayRoot onClose), `GlobalPopupHost.tsx:569-573` | 같음(코드). 실기기는 NOT_PROVEN |
| PU-18 | CTA 검증 | 내부 경로나 https 만 허용하고, 메신저·admin 경로는 막는다. 거래 글·커뮤니티 글·매장·이벤트는 노출 전에 존재·공개를 확인한다 | lock §7, G-7 | `cta.ts:21,140-160`, `popup-event-destination-availability.ts:25-58`, `resolve-popup-ad.ts:221-229`, `GlobalPopupHost.tsx:87-100,318` | 같음 |
| PU-19 | 외부 주소 | 외부 주소는 앱 WebView 가 아니라 인앱 브라우저로 연다 | EVT-04, R-2 정정 | `GlobalPopupHost.tsx:526-527`, `lib/destination/open-destination.ts:21-28` | 같음. 외부 도메인 허용 목록은 없음 → PU-C5 |
| PU-20 | CTA 연타 | 노출 1회당 CTA 처리는 1회다. 이동에 실패하면 잠금을 푼다 | 감사 4단계, 재감사 | `GlobalPopupHost.tsx:491-528` | 같음 |
| PU-21 | 렌더러 | 렌더러 1개(iOS·Android·태블릿 공용), 호스트는 셸마다 1개 | lock §2·§12 | `ConditionalAppShell.tsx:484`, `AdminPlatformShell.tsx:360`, `DibayPopupAd.tsx` | 같음 |
| PU-22 | 모서리 | 모서리는 오버레이 계약(12~24px) 기준 16px | AGENTS.md UI 토큰, 4단계 G-11 | `app/platform-popup.css`(토큰) | 같음(4단계 보고 기준). 화면은 NOT_PROVEN |

#### 고객 화면 — PTR
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PT-01 | 새로고침 분리 | 광고 조회·디코드는 유휴 시간에 4초 제한으로 한다. 새로고침이 광고를 기다리지 않는다 | PTR §3.6, §11.2 | `ptr-reveal-client.ts:22-24,131-195` | 같음 |
| PT-02 | 디코드 후 노출 | 디코드가 끝난 띠만 그린다. 안 끝났으면 단색 슬롯으로 둔다 | PTR §3.6, §4.4 | `ptr-reveal-client.ts:85-99,181-184` | 같음 |
| PT-03 | 폭 변화 | 폭이 바뀌어 기기 변형(휴대폰↔태블릿)이 달라지면 이번 회차는 광고 없이 보이고 다시 조회한다 | R-6 | `ptr-reveal-client.ts:32-35,94,188-190`, `DibayPtrRevealAdLayer.tsx:136-141` | 같음 |
| PT-04 | 띠 3종 | 휴대폰 4:1(필수), 태블릿 8:1(선택), 로고 1:1(선택). 태블릿 띠가 없으면 태블릿에서 광고 없음 | PTR §11.1·§11.3(잠정) | `ptr-reveal-contract.ts`, `ptr-reveal-client.ts:180`, `DibayPtrRevealAdLayer.tsx:262` | 같음. 규격은 「잠정」, iPhone·iPad 는 NOT_PROVEN |
| PT-05 | 가로 화면 | 가로에서 폭 600 이상이면 태블릿 띠를 쓰고, 없으면 일반 PTR 로 둔다 | PTR §11.7 | `resolvePtrBandVariantForViewport` | 같음(코드) |
| PT-06 | 「광고」 표기 | 띠 오른쪽 표시 영역에 「광고」(+ 로고) | PTR §4.4 | `DibayPtrRevealBand.tsx:131-146`, `lib/i18n/catalog/ptr.ts:14` | 같음 |
| PT-07 | 누르는 곳 | 명확한 CTA 만 누를 수 있다(띠 전체 아님) | PTR §4.4, O-8 「지금대로(버튼만)」 | `DibayPtrRevealBand.tsx:104-112` | **다름** — 띠 전체가 `inset-0` 버튼이고, CTA 칩은 그림일 뿐. O-8 의 전제(「지금 버튼만 눌린다」)가 코드와 다름 |
| PT-08 | 누를 수 있는 때 | 새로고침 유지 단계(REFRESHING~접힘)에서만 누를 수 있다. 눌러도 새로고침은 취소하지 않는다 | PTR §4.4 | `DibayPtrRevealAdLayer.tsx:84,267`, `DibayPtrRevealBand.tsx:67,104` | 같음 |
| PT-09 | CTA 연타 | 노출 1회당 이동 1회 | R-1 | `DibayPtrRevealAdLayer.tsx:178,216-219` | 같음 |
| PT-10 | 외부 주소 | 외부 주소는 인앱 브라우저로 연다(location.assign 금지) | R-2 정정 | `DibayPtrRevealAdLayer.tsx:198-208` | 같음 |
| PT-11 | 제외 화면 | 메신저·통화·결제·주문 핵심 화면은 조회 자체를 하지 않는다 | PTR §4.2·§11.2 | `ptr-reveal-client.ts:73-76`, `ptr-reveal/route.ts:51-57` | 같음 |
| PT-12 | 제한 노출 | allowlist 캠페인은 목록에 있는 로그인 회원만 본다. 비어 있거나 비로그인이면 안 보인다 | PTR §11.7 | `resolve-popup-ad.ts:191-202` | 같음 |
| PT-13 | 1위 무효·보류 | 1위 띠가 무효거나 앱이 보류 중이면 exclude 로 보내 다음 순위를 받는다 | S-3 「PTR 보류 exclude」 | `ptr-reveal-client.ts:106-111,172-173`, `ptr-reveal/route.ts:43-49,68-95` | 같음 |
| PT-14 | 팝업과 분리 | 팝업과 PTR 은 서로의 캠페인·소재를 고르지 않는다 | PTR §11.1 | `resolve-popup-ad.ts:191-213` | 같음 |
| PT-15 | 광고 없음 | 광고가 없거나 실패해도 PTR 은 그대로 동작한다. 하우스 광고로 채우지 않는다 | PTR §4.2·§4.3 | `ptr-reveal-client.ts:185-187` | 같음(코드) |

#### 빈도·숨김 (닫기·오늘·세션·다시 보지 않기·새로고침·앱 재시작·계정 전환)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PU-23 | 닫기 = 빈도 | ×·뒤로·ESC·CTA 뒤 숨김은 `frequency_mode` 하나로 정한다(세션→SESSION, 하루→TODAY, 캠페인→CAMPAIGN, close_only→CLOSE) | 프로그램 SSOT FREQUENCY·DISMISS | `dismiss-ssot.ts:17-31`, `GlobalPopupHost.tsx:469-481,513-515` | 같음 |
| PU-24 | 같은 앱 실행 | ×·CTA 로 끝난 팝업은 같은 앱 실행(sessionStorage 수명) 동안 다시 띄우지 않는다. close_only 는 DB 숨김 없이 앱을 새로 켜면 다시 뜬다 | G-6, 프로그램 SSOT close_only 정정 | `popup-app-session.ts:38-72`, `GlobalPopupHost.tsx:479,542` | 같음. 하단 opt-in 버튼 경로(`handleSuppress` `:483-488`)는 세션 차단을 추가하지 않음(기본 UI 에는 없음) |
| PU-25 | 「오늘」 | 「오늘」 = 캠페인 시간대 그날 끝(24시간 아님), 기본 Asia/Manila | lock §4, G-9 | `suppression.ts:111-112,160-170`, `suppress/route.ts:56-77` | 같음 |
| PU-26 | 다시 보지 않기 | 「다시 보지 않기」(CAMPAIGN)는 단순 문구·번역·오탈자 변경으로 초기화하지 않는다. 실질적 소재 변경 + 새 승인 버전일 때만 초기화한다 | Owner 결정 2(11-04) | `load-popup-candidates.ts:265-271`(revision = 소재 id), `GlobalPopupHost.tsx:458-459`, `suppression.ts:145-151`, `admin-campaign-writer.ts:482-500`(소재 교체 = 새 행 + 재검토) | 대체로 같음 — 제목·본문·CTA 변경은 초기화 안 함, 이미지 교체는 초기화. 「실질적 문구 변경」은 구분하지 않음 → PU-C1 |
| PT-16 | PTR 다시 보지 않기 | PTR 의 CAMPAIGN 버전 = 띠 3종(휴대폰·태블릿·로고) 소재를 이은 값 | Owner 결정 2(reaudit §5) | `load-popup-candidates.ts:271`, `ptr-reveal-client.ts:235` | 같음 |
| PU-27 | 새로고침 | 페이지를 새로고침해도 × 닫은 기록은 남는다. 로그인 확인 중을 계정 변경으로 보지 않는다 | 최종 점검 P2 | `popup-app-session.ts:91-101`, `GlobalPopupHost.tsx:229-249` | 같음 |
| PU-28 | 계정 전환 | 계정이 바뀌면 이전 계정의 닫은 기록(세션)을 지운다. DB 숨김은 회원은 user_id, 손님은 기기 키 기준이다 | lock §4 권한 모델 | `GlobalPopupHost.tsx:241-248`, `suppress/route.ts:79-82`, `load-popup-candidates.ts:316-324` | 같음. 손님→회원 숨김 병합은 없음(SSOT NOT_PROVEN, Phase 5) |
| PU-29 | 앱 재시작 | SESSION 숨김과 세션 차단은 앱 재시작 때 풀린다(sessionStorage) | lock §4 SESSION | `popup-app-session.ts:6-22` | 코드는 같음. 네이티브 WebView 재시작 때 sessionStorage 가 실제로 지워지는지는 NOT_PROVEN |
| PT-17 | PTR close_only | close_only PTR 은 같은 화면에 머무는 동안 다시 보이지 않고, 다른 화면으로 가면 풀린다. DB 행은 쓰지 않는다 | PTR §11.2 | `ptr-reveal-client.ts:43,78-83,204-211` | 같음 |
| PT-18 | PTR 숨김 순서 | PTR 빈도 숨김은 POST 가 끝난 뒤 재조회한다. 실패하면 이번 실행 동안 보류한다 | R-5 | `ptr-reveal-client.ts:212-245` | 같음 |
| PU-31 | close_only × DB 행 | close_only × 는 DB 행을 쓰지 않는다(주석·PTR 문서 「팝업과 동일」) | PTR §11.2, `GlobalPopupHost.tsx:477` 주석 | `GlobalPopupHost.tsx:448-461` — CLOSE 도 매번 INSERT | 다름(P-02) — 효과 없는 CLOSE 행이 쌓임(노출에는 영향 없음) |

#### 기록 (노출·클릭·닫힘·이동)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PU-30 | 팝업 CTA | 기록은 click → landing. CTA 로 끝난 노출은 dismiss 를 남기지 않는다(click ≠ dismiss) | ANALYTICS_SSOT, PTR §11.2 「팝업 CTA 와 동일, dismiss 없음」 | `GlobalPopupHost.tsx:500-544` → `suppress()` `:435-446` | **다름**(P-01) — CTA 뒤에 dismiss/suppress 이벤트도 기록됨 |
| PU-32 | 노출 ≠ 숨김 | 노출 기록이 빈도 숨김을 일으키지 않는다 | 프로그램 SSOT 「IMPRESSION ≠ SUPPRESS」 | `GlobalPopupHost.tsx:547-559` | 같음 |
| PU-33 | landing 순서 | landing 은 click 기록이 끝난 뒤 남긴다. 「이동 시작 결과」이고 실제 도착이 아니다 | 감사 4단계, R-2 | `GlobalPopupHost.tsx:529-540` | 같음 |
| PT-19 | PTR 노출 | 노출은 유지 단계 + 슬롯 58px 이상 + 해당 띠 load + 화면 전면일 때 1회. 당기다 취소하면 노출이 아니다 | PTR §11.2 | `DibayPtrRevealAdLayer.tsx:152-171` | 같음 |
| PT-20 | PTR 닫힘 | 띠가 접히면 dismiss(band_collapse)로 남기고, 노출·숨김 행과 분리한다. CTA 로 끝나면 dismiss 없음 | PTR §11.2 | `DibayPtrRevealAdLayer.tsx:97-118,216-219` | 같음 |
| PT-21 | PTR 방문 채널 | PTR CTA 콘텐츠 방문 채널(정본 값 없음) | — | `DibayPtrRevealAdLayer.tsx:202` `"BANNER"` | 확인 못 함 — 근거 없음(P-11) → PT-C2 |
| PU-34 | 서버 중복 방지 | (이벤트 서버 중복 방지·요청 제한) | 계약 없음 | `app/api/platform-popup/events/route.ts:59-83`(그냥 insert), `suppress/route.ts`(P-04) | 근거 없음 → PU-C6 |

#### 사장님 팝업 신청 (신청·승인·반려·비즈니스 캐시)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PU-35 | 신규 판매 | 신규 판매는 꺼져 있다. 신청 생성·제출을 서버가 막고, 기존 신청 보기는 유지한다 | O-7 보류, D-5 | `owner-popup-new-sales-gate.ts:16,21-26`, `app/api/me/platform-popup-requests/route.ts:40`, `.../[requestId]/submit/route.ts:24`, `OwnerPlatformPopupApplyView.tsx:401` | 같음. 초안 수정(PATCH)은 게이트 없음(제출이 막혀 돈 영향 없음) |
| PU-36 | 다시 켜기 조건 | 판매를 다시 켜려면 원자 제출 RPC 가 운영에 적용돼 있어야 한다 | ADS-13 주석 | `owner-popup-new-sales-gate.ts:10-14`, `owner-request-writer.ts:419-445` | 같음(코드). 운영 함수 적용 여부는 이번에 조회하지 않음 |
| PU-37 | 활성화 권한 | 결제만으로 켜지지 않는다. 사장님이 스스로 켤 수 없고 어드민 승인만 활성화한다 | lock §8 | `owner-request-lifecycle.ts:18-38`(사장님 전이에 approved 없음) | 같음 |
| PU-38 | 신청 1건 = 캠페인 1개 | 신청 1건은 캠페인 최대 1개(이중 승인 = 같은 캠페인) | CUT 5 | `owner-request-approve.ts:87-95,230-240` | 같음 |
| PU-39 | 승인 원자성 | 승인은 하나의 트랜잭션이어야 한다(검증 실패 시 캠페인을 남기지 않음) | 재감사 P-05 | `owner-request-approve.ts:180-199` — 캠페인 만든 뒤 검증 | 다름(P-05, 잠복 — 판매 꺼짐) |
| PU-40 | 반려 | 반려 = 비즈니스 캐시 환불 + rejected 를 DB 함수 한 트랜잭션으로 | V3-03 | `owner-request-approve.ts:299-335` | 같음 |
| PU-41 | 수정 요청 | 수정 요청은 환불 없이 다시 제출한다 | lifecycle | `owner-request-approve.ts:366` | 같음 |
| PU-42 | 요청 영역 | 신청 영역이 비면 GLOBAL, GLOBAL 이 있으면 GLOBAL 하나로 정리 | writer | `owner-request-writer.ts:111-115,164`, `owner-request-approve.ts:61-62` | 코드 사실. 사장님 팝업의 기본 범위가 GLOBAL 인 근거는 문서에 없음 → PU-C7 |
| PU-43 | 처리 메뉴 | 배달 메뉴 「사장님 팝업 신청」은 실제 신청 목록(전체 광고 popup·delivery)으로 간다 | R-08 수정 | reaudit §5(`/admin/advertising?family=popup&domain=delivery`) | 이번에 다시 열지 않음 — 확인 못 함 |

#### 어드민 (등록·순위·기간 시간대·정지·종료·미리보기·권한)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 같은가 |
|---|---|---|---|---|---|
| PU-44 | 쓰기 권한 | 팝업·PTR 쓰기(만들기·수정·소재·전이·복사·삭제·직접 팝업)는 `ads` 권한 | admin-route-access, S-2 | `app/api/admin/platform-popup-campaigns/**`, `advertising/direct-popup/route.ts` | 같음. 읽기는 `requireAdminApiUser` |
| PU-45 | 신청 심사 권한 | 사장님 신청 심사는 `business` 권한 | reaudit-final | `platform-popup-requests/[requestId]/actions/route.ts` | 같음 |
| PU-46 | 빈도 입력 | 빈도 입력은 「노출 빈도」 하나다. 「닫은 뒤 다시 안 보기」 칸은 없다(저장값은 보존) | G-5 | `AdminPlatformPopupDetailWorkspace.tsx:885-916,1429-1430` | 같음 |
| PU-47 | 순위 안내 | 순위 안내 = 실제 정렬과 같은 문장 | G-4 | `AdminPlatformPopupDetailWorkspace.tsx:1372-1374` | 같음 |
| PT-22 | PTR 순위 안내 | PTR 순위 안내도 실제 정렬(영역 지정 > 우선순위 > 덜 본 것)과 같아야 한다 | P-09 | `components/admin/ptr-reveal/AdminPtrRevealDetailWorkspace.tsx:354` 「우선순위 (높을수록 먼저)」 | 다름 — 영역 지정 우선이 안내에 없음 |
| PU-48 | 기간 시간대 | 시작·종료는 캠페인 시간대 벽시계로 입력·저장한다(PC 시간대 아님) | G-10, E-8 | `AdminPlatformPopupDetailWorkspace.tsx:3,78-85`, `AdminPtrRevealDetailWorkspace.tsx:3`, `ptr-reveal-admin-patch.ts` | 같음 |
| PU-49 | 노출 자격 | 노출은 approved + active/scheduled + 기간 안일 때만. 정지·종료는 바로 빠진다 | lock §8, PTR §4.5 | `campaign-lifecycle.ts:126-132`, `resolve-popup-ad.ts:178-186` | 같음. PTR 은 앱 캐시 5분 뒤 반영(`ptr-reveal-client.ts:22`) |
| PU-50 | 중요 수정 재검토 | 노출 중에 영역·기간·CTA·문구·소재를 바꾸면 재검토로 돌아간다 | admin writer | `admin-campaign-writer.ts:322-357,482-500` | 같음 |
| PU-51 | 미리보기 | 미리보기는 실제 렌더러와 같은 컴포넌트 | lock §9, PTR §11.4 | `AdminPlatformPopupPreview.tsx`(DibayPopupAd), `AdminPtrRevealPreview.tsx`(DibayPtrSlot) | 같음 |
| PT-23 | PTR 기본 공개 | 새 PTR 은 allowlist + 빈 목록(아무에게도 안 보임)으로 시작한다. 복사는 audience 도 복사한다 | PTR §11.7 | `ptr-reveal-audience.ts` | 이번에 다시 열지 않음 — 확인 못 함 |

#### 근거끼리 충돌 · 근거 없음(Owner 결정 필요)
| ID | 내용 | 충돌하는 근거 둘 | 권장 |
|---|---|---|---|
| PU-C1 | 「다시 보지 않기」 초기화 기준. 코드는 이미지(소재 행)만 버전으로 본다. 제목·본문·CTA 목적지를 크게 바꿔도 초기화하지 않고, 이미지 안 오탈자만 고쳐도 초기화한다 | Owner 결정 2(「실질적 소재 변경 + 새 승인 버전」) ↔ 현재 revision = 소재 id(`load-popup-candidates.ts:265-271`) | Owner 결정: 「실질적」 = 이미지 교체 + CTA 목적지 변경으로 할지 |
| PT-C1 | PTR 누르는 곳 | O-8(「버튼만, 지금대로」) ↔ 코드는 띠 전체 탭(`DibayPtrRevealBand.tsx:104-110`) | O-8 의 전제가 틀렸으므로 Owner 재확인. 「버튼만」이면 CTA 칩만 버튼으로 |
| PU-C2 | 팝업 CTA 뒤 dismiss 기록 | ANALYTICS_SSOT·PTR §11.2(click ≠ dismiss, CTA 뒤 dismiss 없음) ↔ 현행(숨김 쓰기와 함께 dismiss/suppress 이벤트 기록) | 숨김 행은 유지하고 이벤트만 빼기(규칙 판정은 「다름」) |
| PU-C3 | 가로 화면 팝업 차단(태블릿 가로 포함) | lock §11·§14 「landscape 계약 NOT LOCKED」·§12 태블릿 지원 ↔ 코드·감사 §5 「가로 제외 PASS」 | Owner 결정: 태블릿 가로 포함 전면 차단을 정본으로 할지 |
| PU-C4 | 팝업 틀을 이미지 로드 전에 보이게 할지 | PTR §3.6(디코드 전 표시 금지)은 PTR 만의 규칙. 팝업 계약은 노출 기록 시점만 정함 | Owner 결정 필요. 근거 없이 바꾸지 않음 |
| PU-C5 | 외부 주소 허용 정책 | lock §7 「explicit allow policy 아래 승인된 외부 URL」 ↔ 코드는 https 형식만 검사, 도메인 허용 목록 없음(`destination-contract.ts:66`) | Owner 결정: 「명시 허용」 = 어드민 승인으로 볼지, 도메인 목록을 둘지 |
| PU-C6 | 팝업 이벤트·숨김 API 서버 중복 방지·요청 제한(P-04), close_only CLOSE 행 누적(P-02), 숨김 행 무제한 조회(P-03) | 계약 조항 없음(PTR §4.6 「서버 중복 제거 선례는 배달뿐」) | 근거 없음 → Owner 결정 |
| PU-C7 | 사장님 팝업 신청 기본 범위 GLOBAL | lock §8(사장님은 GLOBAL·COMMUNITY·TRADE·MYPAGE 자가 활성화 불가, 어드민 승인 필요) ↔ 기본·승인 시 GLOBAL(`owner-request-approve.ts:61-62`) | 판매 재개(O-7) 때 함께 결정. 지금은 판매가 꺼져 있어 영향 없음 |
| PT-C2 | PTR CTA 방문 기록 채널 `"BANNER"` | PTR 채널 값을 정한 근거 없음(P-11) | Owner 결정 또는 「PTR」 채널 신설 여부 |
| PU-C8 | 첫 화면 인트로와 팝업 순서(인트로 중 팝업 노출 여부) | 근거 없음. 감사 §6 NOT_PROVEN | 실기로 확인 후 결정 |
| PU-C9 | TRADE 영역에 `/write` 글쓰기 화면 포함(`resolve-dibay-surface.ts:123-124`) | lock §3 의 「거래」 범위에 작성 화면이 들어가는지 명시 없음 | Owner 결정 |

**NOT_PROVEN**: Production·Owner 휴대폰·Android 뒤로가기·태블릿·「광고」 표기 실제 모양·PTR 띠 렌더 전부. 손님→회원 숨김 병합. 사장님 팝업 원자 제출 RPC 의 운영 적용 여부.

---


[배포 구분] 변경 없음. 읽기 전용으로 작업했고 코드·DB 변경과 커밋은 0건입니다.
확인 조건은 다음과 같습니다.
- 코드: `/Users/bkkim/projects/samarket-ads-s1`, origin/main `5b832c7d4`(2026-11-04 16:00 PHT)
- 운영 DB `ckdosyydvgzqwpbwuhon`: SELECT 2회(16:10 PHT)
- 화면·실기기·Owner 휴대폰은 보지 않았습니다. 아래 「같음」은 모두 **코드 PASS** 수준이고, 운영·실기 판정은 전부 NOT_PROVEN 입니다.

운영 SELECT 결과 (16:10 PHT)
- 인트로 Live = `unpublished` rev34. 게시본 12건 중 11건이 5초를 넘습니다.
- 배달 배너(ACTIVE·APPROVED·기간 내): 홈 상단 4 · 홈 중간 3 · 업종 상단 8
- 마이 배너 `is_active` = 2건. 둘 다 이름이 `QA-ADS-1103-S6-my-*` 이고 `sort_order=0`, `priority=0` 으로 같습니다. 11-04 06:48·06:49 UTC 에 만든 행이며, 11-03 감사 때는 0건이었습니다.

---

### 배달·마이 배너

#### 고객 화면
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| DB-C01 | 배달 홈 상단(히어로) | 비율은 39:16 하나이고 기기별 비율은 금지 | 배달 SSOT §2 | `lib/stores/advertising/delivery-ad-inventory.ts:52-57` | 같음 |
| DB-C02 | 홈 상단 | 등록 가능한 풀은 최대 5개, 한 번에 1개, 5초 자동 넘김·반복·점. 없으면 자리를 접음 | `banner-placement-capacity-ssot.ts:7-17` · `delivery-ad-launch-placement-product.ts:41-55` | `StoresHomeHeroBanner.tsx:16-18,124-128,151-160` · `load-store-banner-ad-campaigns.ts:242-243` | 같음 |
| DB-C03 | 홈 상단 | ACTIVE·APPROVED·기간 안·지면 일치·소재 준비·CTA 준비·자금(사장님 결제분 FUNDED)·매장 자격·배달 범위를 모두 만족할 때만 노출 | SSOT §9 · CUT C 「Payment ≠ ACTIVE」 | `banner-home-hero-exposure.ts:35-70` · `load-store-banner-ad-campaigns.ts:121-135` | 같음 |
| DB-C04 | 배달 3지면 공통 | 비로그인이거나 주소가 없으면 배너를 내려주지 않음 | 묶음4 R-1(코드 주석만 있음) | `app/api/stores/home-hero-banners/route.ts:29-35` | 같음. 근거 문서는 없습니다 |
| DB-C05 | 배달 3지면 공통 | 「광고」 표기. 샘플 매장이면 「샘플 광고」 | stage3 G-12 · B-10 | `StoresHomeHeroBanner.tsx:219` · `DeliveryAdBanner.tsx:107-118` · i18n `store-commerce-ui.ts:322-323` | 같음 |
| DB-C06 | 배달 3지면 공통 | 이미지가 깨진 배너는 빼고 다음 배너로 넘김. 남는 게 없으면 자리를 숨김 | ADC-09 · R3 B-3 | `StoresHomeHeroBanner.tsx:224-228` · `StoresHomeBeforeRestBanner.tsx:100-104` · `StoresBrowseTopBanner.tsx:97-101` | 같음 |
| DB-C07 | 홈 상단 | 불러오는 동안 빈 140px 상자를 그렸다가 사라지며 화면이 밀리지 않아야 함 | 감사 B-4 · R3 | `StoresHomeHeroBanner.tsx:57-60,134-148` | **다름**. 기기 저장값을 그리기 전(layoutEffect)에 읽기 때문에, 서버 HTML 첫 그림에는 항상 140px 상자가 들어갑니다(D-02). 실제로 깜빡여 보이는지는 NOT_PROVEN |
| DB-C08 | 홈 상단 점 | 점 묶음 줄은 누름을 받지 않고 점(24px)만 받음 | 재감사 D-01 | `StoresHomeHeroBanner.tsx:233-252` | 같음. 실기 NOT_PROVEN |
| DB-C09 | 홈 중간(INLINE_1) | 2:1, 한 번에 1개, 회전 없음. 예비 풀은 3 | SSOT §2(2026-11-03 정정) · `delivery-ad-stage2-surface-contract.ts:181-182` | `StoresHomeBeforeRestBanner.tsx:65` · `home-before-rest-banners/route.ts:41` | 같음 |
| DB-C10 | 업종 상단(CATEGORY_TOP) | 2:1, 한 번에 1개, 회전 없음. 예비 풀은 3 | SSOT §2 · stage3 B-3 | `StoresBrowseTopBanner.tsx:68` · `browse-top-banners/route.ts:121` · `stage2-surface-contract.ts:167,174` | 같음 |
| DB-C11 | 매장 홍보(홈 목록 끼움) | 끼운 매장 카드에 「광고」 배지 | stage3 G-12 | `StoresHomeCompositionSlotSection.tsx:385-455` · `StoresHomeStoreHorizontalCard.tsx:96-97` | 같음 |
| DB-C12 | 매장 홍보 | 일반 순위와 분리(유료가 순위 점수에 끼어들기 금지). 끼움 계획 → 교차 배치 | SSOT §8 | `orderHomeRestStoresForPaidInsertion` (위 파일 :370) | 확인 못 함. 배치 함수 본문은 열지 않았습니다. 업종 목록 끼움(CATEGORY_FEED)도 보지 않았습니다 |
| MB-C01 | 마이 홈 프로필 아래 | 활성이고 기간 안인 배너를 최대 10건 받고, 닫지 않은 첫 1건을 그림 | 광고 최종 점검(마이 CMS) | `mypage-summary.server.ts:85-96` · `mypage-home-banner-pick.ts:8,14-24` | 같음 |
| MB-C02 | 마이 | 폭 768px 미만은 모바일 이미지(없으면 기본 이미지)를 씀 | 광고 최종 점검 | `MyTopBanner.tsx:21-43` · `mypage-home-banner-pick.ts:27-34` | 같음 |
| MB-C03 | 마이 | 닫기는 배너 id 단위로 기기에 저장. 닫을 수 없는 배너는 항상 보임 | v2.1 §6 | `MypageHomeCmsBanner.tsx:20-36` · `mypage-home-banner-pick.ts:20` | 같음 |
| MB-C04 | 마이 | 고객 순서 = 어드민 순서 | 재감사 D-04 | 고객 `mypage-summary.server.ts:94`(sort_order 만) ↔ 어드민 `admin-banners-db.ts:90-92`(priority → sort_order → created_at desc) | **다름**. 지금 운영 QA 2건이 sort_order 0 으로 같아서, 고객 화면 순서는 정해지지 않은 상태입니다 |
| MB-C05 | 마이 | 링크는 openDestination 으로 엶(외부 주소는 인앱 브라우저) | EVT-07 | `MyTopBanner.tsx:65-70` | 같음 |

#### 사장님 신청·결제 (비즈니스 캐시)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| DB-O01 | 사장님 광고 신청 | 사장님이 살 수 있는 상품은 홈 상단 배너, 홈 매장 목록, 업종 매장 목록뿐. 검색 상단은 판매하지 않음. 홈 중간·업종 상단은 어드민이 직접 등록 | stage3 B-3 · 감사 A-6 | `owner-banner-contract.ts:31-33,75-89` · `delivery-ad-launch-placement-product.ts:15-56,107-115` | 같음 |
| DB-O02 | 결제 | 결제는 비즈니스 캐시(AST-005)로만 | CUT C hard lock 「AD BILLING = Cash only AST-005」 | `canonical-business-cash-contract.ts:66-73` | 같음. 단 배달 SSOT §6 과 충돌합니다(X-01) |
| DB-O03 | 제출·재제출 | 캐시 차감 1회와 상태 전이를 DB 함수 하나로 처리. 전이가 실패하면 차감도 남지 않음 | DEF-7 | `canonical-business-cash-writer.ts:464-516` · `owner-banner-writer.ts:562` · `owner-store-sponsored-writer.ts:769` | 같음 |
| DB-O04 | 반려 | 반려되면 1회 환불(원자적) | 결제 모델 규칙 `canonical-business-cash-contract.ts:69-70` | `admin-delivery-ad-writer.ts:288-325` · migration `20270523120200` | 같음 |
| DB-O05 | 노출 | 결제했다고 바로 노출되지 않음. 사장님 결제분은 FUNDED 이고 어드민 승인을 받아야 노출. DIBAY 자체 배너는 자금 검사를 건너뜀 | CUT C 불변 1 | `delivery-ad-business-cash-contract.ts:18-25` · `banner-home-hero-exposure.ts:59-66` | 같음 |
| DB-O06 | 승인 권한 | 사장님은 어드민 승인을 할 수 없음 | SSOT §5 | `canTransitionDeliveryAdLifecycle` | 확인 못 함. 함수 본문은 열지 않았습니다 |
| DB-O07 | 진행 중 운영 종료 | 진행 중 운영 종료 때의 환불 규칙 | 없음 | — | X-05 로 넘김 |

#### 기록 (노출·클릭)
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| DB-R01 | 배달 배너·매장 홍보 | 노출 = 고객 화면 + 노출 토큰 있음 + 화면 50% 이상 + 1초 + 앱이 앞에 있음. 같은 인스턴스는 1회 | `delivery-ad-event-contract.ts:23-31` | `useDeliveryAdEvents.ts:36-99` · `DeliveryAdBanner.tsx:47` | 같음 |
| DB-R02 | 노출 API | 중복 판정 키는 서버가 (토큰, 세션) 으로 정함 | ADS-10 · 같은 계약 | `app/api/stores/ads/impression/route.ts:28-35` | 같음 |
| DB-R03 | 미리보기 | 사장님·어드민 미리보기는 기록하지 않음 | CUT G | `useDeliveryAdEvents.ts:32-35` · `DeliveryAdBanner.tsx:38,47,76` | 같음 |
| DB-R04 | 클릭 | 누르면 클릭을 기록하고 openDestination 으로 이동 | EVT-07 | `DeliveryAdBanner.tsx:74-81,174-186` | 같음 |
| DB-R05 | 예비 배너 | 예비 배너는 실제로 보였을 때만 기록 | `stage2-surface-contract.ts:169-174` | 위 DB-R01 | 같음 |
| DB-R06 | 성과 연결·과금 | 주문 연결은 꺼져 있음(기간 미설정). CPC 등 과금은 실행하지 않음 | event-contract `:13-21` · SSOT §6 | `delivery-ad-lifecycle.ts:145` | 같음 |
| DB-R07 | 매장 없는 홈 상단 배너 | 매장 id 가 없는 배너는 노출 토큰이 없어서 기록되지 않음 | 없음 | `load-store-banner-ad-campaigns.ts`(토큰은 `storeId ?` 일 때만 발급) | X-04 로 넘김 |
| MB-R01 | 마이 배너 | 노출·클릭 기록 규칙 | 없음 | `admin-banners-db.ts:24-25` 는 읽기만 하고, 쓰는 코드는 0건(grep). 운영 2건도 0/0 | X-06 로 넘김 |

#### 어드민
| ID | 화면·위치 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| DB-A01 | 배달 광고 쓰기 API 전부 | `business` 권한 필요 | 묶음4 A-07 | `app/api/admin/delivery-ads/{first-party,[campaignId],extend,actions,commercial,upload-banner-image}/route.ts` (requireAdminPermission("business")) | 같음 |
| DB-A02 | 자체 배너 등록 | 지면은 홈 상단·홈 중간·업종 상단. `DIBAY_FIRST_PARTY` 이고 과금 없음. 매장 홍보는 자체 등록 금지 | R4 | `admin-first-party-banner-inventory.ts:8-10` · `delivery-ad-admin-first-party-writer.ts:2-3,264,290` | 같음 |
| DB-A03 | 삭제 | 실제 삭제는 DRAFT 이고 노출·클릭·과금·감사 이력이 0일 때만. 이력이 있으면 종료·보관 | SSOT §7 | `admin-delivery-ad-writer.ts:381-396` | 일부만 확인. 상태·updated_at·확보된 자금 차단만 봤고, 이력 0 검사는 확인 못 함 |
| DB-A04 | 검색 상단 패키지 | 판매하지 않음(패키지 3개 꺼짐) | 감사 A-6(운영 적용 11-03) | 운영 DB | 11-03 적용 기록만 있습니다. 이번에 다시 조회하지 않았습니다 |
| MB-A01 | 마이 배너 목록 상태 | 고객에게 안 나오는 배너는 「활성」으로 보이면 안 됨 | 감사 B-7 · 재감사 D-05 | `admin-banner-utils.ts:24-31` | **다름**. 종료 시각이 지난 것만 「만료」로 바꿉니다. 시작 전인 `active` 는 「활성」으로 보입니다 |
| MB-A02 | 마이 배너 삭제 | 게시한 적 없는 초안만 실제 삭제. 나머지는 숨김 | AD-01 · J-4 | `admin-banners-db.ts:201-230` | 같음 |
| MB-A03 | 공통 광고 화면 「마이 배너 노출 중」 수 | 고객 조회와 같은 조건으로 셈 | 재감사 N-10 | `app/api/admin/advertising/other-surfaces/route.ts:31-35` | **다름**. `status='active'` 로 세고 종료 시각을 같은 순간까지 포함합니다. 고객 조회는 `is_active` 로 고르고 종료 순간부터 뺍니다. 지금 운영 값은 같습니다 |

---

### 인트로

#### 앱 시작 흐름 (준비·표시·종료·시작 화면 해제·백그라운드·오류)
| ID | 단계 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| IN-S01 | 대상 | 네이티브 앱에서 launch epoch 가 있을 때만. 웹·Windows·구 바이너리는 인트로 없음 | launch-intro §12 · 생명주기 SSOT | `launch-epoch.ts:9-19` · `startup-destination.ts:59-60` | 같음 |
| IN-S02 | 판정 | 확실한 USER_COLD(FRESH)에서만. WARM·OS_RESTORE·AMBIGUOUS 는 인트로 없음 | 생명주기 SSOT §1·§7 | `startup-destination.ts:55-58` | 같음 |
| IN-S03 | 판정 | 문서당 1회, 동기, 네트워크 없이 promote 된 로컬 index 만 읽음. index 가 없으면(첫 설치) 건너뛰는 것이 정상 | 생명주기 §7.1 | `startup-destination.ts:51-74` | 같음 |
| IN-S04 | 의도 우선 | 푸시·딥링크·통화 경로가 있으면 해제 전에 커뮤니티로 넘김 | 생명주기 §8 | `LaunchIntroRoot.tsx:78-84` | 같음 |
| IN-S05 | 준비 | 모든 장면 이미지를 검증된 로컬 캐시에서 읽고 decode 한 뒤에 첫 프레임. 자산이 없거나 decode 가 실패하면 index 를 지우고 바로 커뮤니티로 | contract §13 | `LaunchIntroRoot.tsx:97-125` | 같음 |
| IN-S06 | 해제 | OS 시작 화면 해제는 인트로 첫 프레임의 다음 rAF 에서 1회만 | contract §9 | `LaunchIntroRoot.tsx:220-236` · `startup-metrics.ts:402-412` · `os-release-owner.ts:24-37` | 같음 |
| IN-S07 | 장면 | 장면 타이머는 해제 뒤에만 시작 | contract | `LaunchIntroRoot.tsx:287` · `LaunchIntroPlayer.tsx:70-76` | 같음 |
| IN-S08 | 종료 | 먼저 온 종료가 이김. 완료·건너뛰기·CTA 는 목적지 화면이 그려질 때까지 오버레이 유지. 넘기는 중 탭하면 바로 닫힘. 타이머 없음 | contract §10·§11 | `LaunchIntroRoot.tsx:173-208,279` | 같음 |
| IN-S09 | 해제 전 백그라운드·오류 (showing 단계) | 해제 권한을 커뮤니티로 넘기고, 같은 epoch 에는 다시 보여 주지 않음 | I-4 문서 §2·§3 | `LaunchIntroRoot.tsx:181-192` | 같음. 실기 NOT_PROVEN |
| IN-S10 | 해제 전 백그라운드 (preparing 단계) | I-4 표: 해제 전 백그라운드 → 복귀하면 커뮤니티, 인트로는 다시 안 나옴 | I-4 문서 §3 | `LaunchIntroRoot.tsx:241-250` (백그라운드 감지는 showing·exiting 단계에서만 붙음) | **다름**. preparing 중에 내렸다가 돌아오면 준비가 이어진 뒤 인트로가 나옵니다(멈추지는 않음) |
| IN-S11 | 준비 중 비동기 예외 | 끝나지 않는 상태가 없어야 함(무한 로딩 금지) | 생명주기 §6 원칙 1 | `LaunchIntroRoot.tsx:77-150` (async IIFE 에 바깥 catch 없음. IntroErrorBoundary 는 비동기 예외를 잡지 못함) | 확인 못 함. 예상 밖 예외가 나면 preparing 에 머물러 시작 화면이 닫히지 않을 수 있는 경로가 코드에 있습니다. 재현은 하지 않았습니다 |
| IN-S12 | 안전 타이머 | 시작 화면을 강제로 닫는 타이머·최소 표시 시간 금지 | `startup-metrics.ts:13` · Owner 결정 4 | `prepare-deadline.ts` 없음(삭제됨) · Android `MainActivity.java:1274` 는 웹 신호로만 닫음 | 같음 |

**준비 단계별 — 끝나지 않을 수 있는지·복구 경로** (Owner 결정 3. 측정값은 없음 = NOT_PROVEN)
| 단계 | 호출 | 끝나지 않을 수 있는가 | 실패·지연 시 복구 |
|---|---|---|---|
| P1 | `NativeIncomingCall.getPendingPushRoute` (`launch-intent.client.ts:37-44`) | **있음**. 시간 제한이 없습니다. 거절되면 「의도 없음」으로 처리되지만, 응답이 오지 않으면 preparing 에 그대로 머뭅니다 | 없음. 앱을 강제 종료해야만 풀립니다 |
| P2 | `App.getLaunchUrl` (`:45-52`) | **있음**. P1 과 같습니다 | 없음 |
| P3 | 기기 종류 `resolveDibayDeviceClass` (게시본이 phone·tablet 지정일 때만, `LaunchIntroRoot.tsx:87-96`) | 브리지 대기는 최대 3.5초입니다(`dibay-device-class-native.ts:35-38`). 넘기면 UNKNOWN → 커뮤니티. 그 뒤 `invokeNativeDeviceClass`(`:17-30`)에는 시간 제한이 **없음** | 대기를 넘기면 커뮤니티. 네이티브 응답이 없으면 복구 없음 |
| P4 | 캐시 읽기 `caches.open/match/blob` (`cache.ts:137-149`) | 보통 성공이나 실패로 끝남(try/catch → null). 저장소 I/O 가 멈추는 경우는 확인 못 함 | null → `asset_missing` → 바로 커뮤니티 |
| P5 | `Image.decode()` (`LaunchIntroRoot.tsx:111-122`) | 거절되면 `decode_failed` 로 끝남. 백그라운드 WebView 에서 decode 가 미뤄지는지는 확인 못 함 | 바로 커뮤니티 |
| P6 | 영상 | object URL 만 만들고 기다리지 않음 | 재생 실패는 영향 없음 |
| 측정 | — | `[dibay-launch-intro] phase=` 콘솔 로그(`LaunchIntroRoot.tsx:209-211`)만 있고, 시각 기록·DB 기록은 없음 | 적정값은 근거가 없습니다. 실기 v3 H-4 의 logcat 시각으로 기기별 preparing→showing 을 재야 합니다 |

#### 게시·일정·빈도·대상
| ID | 항목 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| IN-P01 | 게시 | 게시본은 변경 불가. 검사 → 자산 sha 확인 후 공개 경로로 복사 → DB 함수 1회로 게시본 + Live | contract §3 | `server.ts:367-433` | 같음 |
| IN-P02 | 동시성 | 초안 version 이 다르면 409 | contract | `server.ts:381` | 같음 |
| IN-P03 | Live 상태 | Live 1개, active·paused·unpublished. 거부된 전이는 409 | contract §7 | `server.ts:460-494` | 같음 |
| IN-P04 | 길이 | 인트로 전체 5초 이하. 게시·재개·재게시 모두 검사. 옛 게시본은 읽기만 허용 | Owner 2026-10-02 · 감사 I-3 | `document.ts:23-28` · `server.ts:409-411,471-483` | 같음. 운영 게시본 11/12건이 5초 초과라 다시 올릴 수 없습니다 |
| IN-P05 | 일정 | 시작·종료는 마닐라 시간으로 입력. 기기는 캐시된 게시본으로 판정하고 종료 시각부터 뺌 | P5 | `startup-destination.ts:36-42` | 같음 |
| IN-P06 | 빈도 | every_launch(epoch 당 1회) · once_per_publication · once_per_day(마닐라 날짜). 첫 프레임에서 소비. 저장소가 실패하면 허용 | P6 | `frequency.ts:1-68` · `LaunchIntroRoot.tsx:229-233` · `launch-epoch.ts:30-36` | 같음 |
| IN-P07 | 대상 | all·phone·tablet. UNKNOWN 은 어느 대상에도 맞지 않음 → 커뮤니티 | P7 | `target.ts:14-18` · `LaunchIntroRoot.tsx:87-96` | 같음 |
| IN-P08 | 받기 | 자산을 모두 받아 bytes·sha 를 확인한 뒤 setItem 1회로 promote. 실패하면 아무것도 바뀌지 않음. 새 게시본은 **다음** USER_COLD 부터 | contract §4 · 생명주기 §7.1 | `cache.ts:111-134` · `discovery.ts:40-104` | 같음 |
| IN-P09 | 확인 시점 | 시작 화면 해제 뒤와 앱 복귀 때만 확인. 폴링 없음. no-store | contract §4 · live route 주석 | `discovery.ts:107-117` · `live/route.ts:15` | 같음 |
| IN-P10 | 일시정지·중단 전달 | 일시정지·재개·중단 revision 은 늦게 전달되지 않음 | `live/route.ts:11-12` 주석 · 재감사 I-01 | `server.ts:189-191` → `live/route.ts:37`(500) → `discovery.ts:54` | **다름**. Live 게시본 문서가 손상되면 500 이 나서, 기기는 이전 state(예: active)를 계속 씁니다. 운영이 unpublished 라 지금 피해는 없습니다 |
| IN-P11 | 내용 | DIBAY 자체 안내·브랜드 화면만. 매장·외부 업체 광고 금지(Google Play) | stage3 G-12 · 13차 문서 머리 | `lib/i18n/catalog/admin-launch-intro.ts:12` (안내 문구만) | 같음. 규칙은 안내로만 있고, 기술적으로 막는 코드는 없습니다 |

#### 어드민 (편집·게시·재게시·5초 규칙·오류 문구·손상 게시본)
| ID | 항목 | 규칙 | 근거 | 지금 코드 위치 | 규칙과 같은가 |
|---|---|---|---|---|---|
| IN-A01 | 권한·사유 | 쓰기는 `settings` 권한. 사유는 게시(L2)·재개·재게시(L2)·중단(L3)·초안 삭제에 필수, 일시정지는 선택. 감사 기록 | R2 | `app/api/admin/launch-intro/{route,publish,state,upload}` (`publish/route.ts:15,29-31` · `state/route.ts:17,30`) | 같음 |
| IN-A02 | 게시 전 검사 | 확인창 전에 서버와 같은 검사를 하고 한국어 문구로 보여 줌 | 감사 I-5 · S-2 | `LaunchIntroAdminPage.tsx:168-186,795-835` | 같음 |
| IN-A03 | 5초 규칙 화면 | 게시는 문구와 함께 막음. 재개·재게시 버튼은 끄고 이유를 보여 줌 | I-3 · R2 | `LaunchIntroAdminPage.tsx:806-815,1093,1110-1113,1140-1152` | 같음 |
| IN-A04 | 게시 폼 | 일정·빈도·대상은 Live 게시본 값으로 시작. 기간이 끝났으면 날짜는 비움 | I-6 · E-9 | `LaunchIntroAdminPage.tsx:591-606` | 같음 |
| IN-A05 | 손상 게시본 | 목록에 따로 「손상됨」으로 보이고, 다시 게시할 수 없음 | 재감사 §2 | `LaunchIntroAdminPage.tsx:1161-1185` · `server.ts:142-164` | 일부 다름. 분리 표시는 됩니다. 문구가 검사 코드 원문(`{error}`, 예: `scene_empty`)을 그대로 보여 줍니다(i18n `:99`, 재감사 I-02) |
| IN-A06 | 게시본 목록 | 20건씩, 최대 200건 | R3 I-7 | `LaunchIntroAdminPage.tsx:160-166` | 같음 |

---

#### 근거끼리 충돌 · 근거 없음 (Owner 결정 필요)
| ID | 내용 | 충돌하는 근거 둘 | 권장 |
|---|---|---|---|
| X-01 | 배달 광고 과금 | 배달 SSOT §6 「chargeExecution=false, 과금 구현했다고 하지 말 것」 ↔ CUT C 「AD BILLING = Cash AST-005」와 코드의 제출 때 캐시 차감·반려 환불(`canonical-business-cash-writer.ts:464`) | SSOT §6 을 「캐시 선차감·반려 환불은 구현됨, CPC 등 성과 과금은 미실행」으로 고치기(문서만) |
| X-02 | 배달 SSOT 가 현재 구현과 다름 | §9 「매장 자격 null → true = PARTIAL」 ↔ `store-paid-ad-exposure.ts:3` 「CUT D fail-closed」. §10·§11 「사장님·어드민 화면 Stub, C–K 시작 안 함」 ↔ 실제로 구현된 화면·API | 현재 코드 기준으로 문서 정정. 배너 쪽 `isBannerStoreEligible` 은 집합이 null 이면 true(`load-banner-store-eligibility.ts:95`)로, 로더가 항상 집합을 넘깁니다 |
| X-03 | 홈 중간 예비 풀 | SSOT §2 INLINE_1 행에 「예비 3」 없음(D-03) ↔ `stage2-surface-contract.ts:181-182` (=3) | SSOT 행에 「등록 수용량 3 = 예비 풀」 추가(문서만) |
| X-04 | 매장 없는 홈 상단 배너의 노출 기록 | 근거 없음. 토큰은 `storeId` 가 있을 때만 발급됩니다. 그런 배너가 운영에 있는지도 확인 못 함 | Owner 결정: 자체 배너도 기록하는가 |
| X-05 | 배달 배너 진행 중 운영 종료 때 환불 | 규칙은 반려 환불만 있음(`canonical-business-cash-contract.ts:69-70`). 진행 중 종료는 근거 없음(최종 점검 :137 「진행 중 환불 없음」) | Owner 결정: 남은 기간 비례 환불 여부 |
| X-06 | 마이 배너 노출·클릭 수 | 어드민 화면은 클릭/노출 수를 보여 주는데(`AdminBannerTable.tsx:72`, `AdminBannerDetailPage.tsx:174`), 기록하는 코드가 없어 항상 0. 기록 규칙도 없음 | Owner 결정: 기록을 추가할지, 숫자 칸을 숨길지 |
| X-07 | 마이 배너 「광고」 표기 | SSOT §1 은 `my_page_banners` 를 광고와 분리된 것으로 둠 ↔ G-12 「광고 지면은 표기」. 마이 배너가 광고인지 정의가 없음 | Owner 결정 |
| X-08 | 옛 인트로 문서 본문 | 13차 문서 머리는 「대체됨」인데 `:5` 가 아직 「ACTIVE」(I-05). 본문 「SYSTEM_START 최소 표시 500–5000ms, max(첫 프레임, 최소값)」 ↔ `startup-metrics.ts:13` 「최소 표시 시간 금지」 · Owner 결정 4 | `:5` 의 ACTIVE 삭제·대체 표시(문서만) |
| X-09 | 준비 단계 네이티브 호출(P1~P3)의 시간 제한 | Owner 결정 3(측정 근거로 적정값 제시) ↔ Owner 결정 4(시작 화면 강제 종료용 안전 타이머 금지). P1~P3 에 시간 제한을 두면 끝날 때 결국 커뮤니티로 넘어가 시작 화면이 닫히는데, 이는 금지된 타이머와 결과가 같음(재감사 I-04). 측정값 0건 | 값은 제시하지 않습니다(근거 없음). ① 실기 H-4 로 기기별 P1~P3 시간을 먼저 잰다 ② 「시간 제한 → 커뮤니티로 넘김」이 결정 4 에 해당하는지 Owner 가 해석. 그 전까지 지금 상태(시간 제한 없음, P1·P2 응답이 없으면 복구 없음)를 유지 |
| X-10 | 준비 중 백그라운드 | I-4 문서 §3 은 「해제 전 백그라운드 → 커뮤니티」인데 구현은 showing 단계만 다룸(IN-S10) | I-4 범위를 preparing 단계까지 넓힐지 Owner 확인. 통화 경로가 아니라 시작 경로 변경이라 영향 분석 문서와 승인 후 진행 |
| X-11 | 어드민 게시 폼 빈도 기본값 | 폼 기본값 `once_per_day`(`LaunchIntroAdminPage.tsx:507`) ↔ 문서 기본값 `every_launch`(`document.ts:172`). 어느 쪽인지 정한 지시가 없음 | Owner 결정: 기본 빈도 |

남은 위험·NOT_PROVEN
- 화면·실기기·Owner 휴대폰 판정은 전부 NOT_PROVEN 입니다.
- 인트로는 운영이 unpublished 라 실기로 재현하려면 운영 설정을 바꿔야 합니다(운영 시험 저장 규칙 8번).
- 운영 마이 배너 2건은 QA 행이고 sort_order 가 같아 고객 화면 순서가 정해지지 않습니다(MB-C04).
- 열지 않아 「확인 못 함」으로 둔 것: 매장 홍보 끼움 배치 함수, 업종 목록 끼움, 승인 권한 함수, 삭제 이력 0 검사.

---


### 어드민 공통

확인 조건: 코드 = `/Users/bkkim/projects/samarket-ads-s1` (origin/main `5b832c7d4`, 읽기 전용). 운영 DB `ckdosyydvgzqwpbwuhon` 에서는 SELECT 1회만 했다(`audit_logs` 의 action 별 건수, 2026-11-04 PHT). 화면 캡처나 실기기 확인은 하지 않았다. 그래서 아래 「같음/다름」은 모두 **코드 기준**이고, 화면 판정은 전부 NOT_PROVEN 이다.

#### 메뉴 구조
| ID | 메뉴·경로 | 규칙 | 근거 | 지금 코드 위치(file:line) | 같은가 |
|---|---|---|---|---|---|
| AD-001 | 전체 메뉴 정본 | 메뉴 정본은 `admin-menu.ts` 하나뿐이고, 같은 경로의 기본 메뉴도 1개뿐이다 | CUT A §1 · CUT J 불변 1·3 | `components/admin/admin-menu.ts:2008-2019` (별칭 `entryAlias` 는 기본 목록에서 빠짐) | 같음 |
| AD-002 | 광고·배너 › 광고 운영 7개 | 전체 광고 `/admin/advertising` · 상위노출 관리 `/boosts` · 광고 승인 `/applications` · 노출 관리 `/operations` · 광고 위치 `/placements` · 광고 상품/가격 `/products` · 광고 이력 `/history`. 7개로 고정한다 | final-double-check §3-1 · CUT J J-AMD-5 표 「광고·배너 7 public」 | `admin-menu.ts:1363-1414` · 라벨 `lib/i18n/catalog/admin-delivery-ads.ts:111-117` | 같음 |
| AD-003 | 광고·배너 › 배너·팝업·프로모션·앱 시작 화면 바로가기 | 원래 메뉴는 플랫폼 운영에 둔다. 광고·배너에서는 같은 경로를 바로가기(`entryAlias`)로만 연다 | final-double-check §3-1 · O-5 | 배너 `:1418-1442`, 팝업·PTR `:1445-1465`, 이벤트·사장님 이벤트·쿠폰·상품권·매장 노출 `:1468-1509`, OS 시작·인트로·시작 설정 `:1512-1538` | 같음 (CUT J 문서 표와의 충돌은 AD-C01) |
| AD-004 | 플랫폼 운영 (원래 메뉴) | 이벤트·팝업·PTR·프로모션 배너·사장님 이벤트 신청이 여기 있다. 인트로·마이 배너는 「앱 화면 구성」 아래 있다 | CUT J J-AMD-5 §5 | `admin-menu.ts:1622-1677` · `:1679-1709` (`my-banners` `:1708`) | 같음 |
| AD-005 | 옛 광고 메뉴 | 사이드바에 보이지 않는다(`sidebarPublic:false`). 키와 이동 경로만 남긴다 | CUT A §5 · CUT J 불변 7 | `admin-menu.ts:1542-1615` | 같음 |
| AD-006 | 배달 › 혜택·프로모션 | 광고 위치·배너·팝업·PTR·이벤트·매장 홍보 신청·사장님 팝업 신청. 모두 공통 화면을 `?domain=delivery` 로 연다 | O-6① · reaudit §5 R-08 | `admin-menu.ts:705-712` | 같음 (R-08 수정으로 사장님 팝업 신청 = `/admin/advertising?family=popup&domain=delivery` `:712`) |
| AD-007 | 거래 › 상위노출 | 거래 상위노출 · 상위노출 가격 · 바로가기 5개(`?domain=trade`) · 회원 배너 신청 | O-6① | `admin-menu.ts:911-925` | 같음 |
| AD-008 | 커뮤니티 › (구역) | 커뮤니티 상위노출 · 바로가기 5개 · 회원 배너 신청 · 상위노출 가격(거래와 같은 가격 화면) | O-6① | `admin-menu.ts:1059-1077` | 같음 |
| AD-009 | 커뮤니티 구역 제목 | 「상위노출」로 통일한다 | final-double-check §3-3 H-7 · S-2 「커뮤니티 어드민 『상위노출』」 · O-1 | `lib/i18n/catalog/admin-community-r4.ts:16` = **「홍보」** | **다름** — 거래 구역은 「상위노출」(`admin-trade-admin.ts:11`)인데 커뮤니티 구역 제목은 아직 「홍보」다 |
| AD-010 | 도메인 메뉴에서 쓰는 바로가기 이름 | 매장 홍보 신청 · 사장님 팝업 신청 · 회원 배너 신청 · 상위노출 가격 | O-6① | `lib/i18n/catalog/admin-ia-r1.ts:44-52` | 같음 |
| AD-011 | 공통 화면의 `?domain=` 거름 | 고른 도메인의 행만 서버에서 거르고, 「○○만 보는 중 · 전체 보기」 칩을 보여 준다 | O-6② (운영 DB 적용 PASS) | `AdminAdvertisingWorkspace.tsx:282,892-904` | 같음 |

#### 광고 종류 × 위치 × CTA (공통 화면 / 도메인 메뉴)
공통 화면에서 쓸 수 있는 행 조치는 `filterWorkspaceActionsByMode` 가 정한다 (`lib/admin/advertising-workspace/resolve-drawer-actions.ts:165-190`).
- 「전체 광고」「노출 관리」: 기간 변경·정지·재개·종료·강제 종료·보상 연장·초안 삭제
- 「상위노출 관리」: 정지·재개만
- 「광고 승인」「광고 이력」: 행 조치 없음. 광고 승인은 「검토하기」로 상세 화면에 들어가서 처리한다

| ID | 광고 종류 | CTA | 공통 화면에서 | 도메인 메뉴에서 | 사유 단계 | 서버 권한 키 | 감사 이름 | 근거 | 같은가 |
|---|---|---|---|---|---|---|---|---|---|
| AD-101 | 인트로 | 만들기·수정·게시·정지 | 「전체 광고」 위 카드에 상태만 보이고 「관리」로 이동한다 | 플랫폼 운영 › 앱 화면 구성 (`/admin/platform-promotion/intro`) | 저장 L1 · 게시 L2(`exposeStart`) · 삭제 L3 (`LaunchIntroAdminPage.tsx:689-738,839,1661`) | settings (`admin-route-access.ts:192`) | 확인 못 함 | O-5 · final §3-2 | 같음 (공통 화면은 카드뿐이고, O-5 결정대로 목록 행은 없다) |
| AD-102 | 운영자 팝업 | 만들기 | `/admin/advertising/direct/popup` | 플랫폼 운영 › 팝업 | — | ads (`:232`) | `platform_popup.create` (운영 52건) | final §3-2 | 같음 |
| AD-103 | 운영자 팝업 | 재개 | 「재개」 = `resume` **L1** (사유 없음) — `admin-mutation-confirm-copy.ts:58-62` | 팝업 상세 「노출 시작」 = `exposeStart` **L2** (사유 필수) — `AdminPlatformPopupDetailWorkspace.tsx:415-421` | 같은 동작인데 공통 L1 / 도메인 L2 | ads | `platform_popup.transition` | `admin-action-levels.ts` 머리말 「같은 동작은 어디서나 같은 단계」 | **다름** |
| AD-104 | 운영자 팝업 | 정지 · 종료 · 초안 삭제 | 정지 L1 · 종료 L3 · 초안 삭제 L3 | 상세: 정지 L1 · 종료 L3(재입력) · 삭제 L3 | 같음 | ads | `platform_popup.transition` / `delete_draft` | 동작 표 | 같음 |
| AD-105 | 운영자 팝업 | 기간 변경 | 공통 화면 `change_period` (L1, PHT 입력) | 상세에서 수정 | L1 | ads | 확인 못 함 (writer 안 감사는 열어 보지 않음) | G-10 | 확인 못 함 |
| AD-106 | 사장님 팝업 신청 | 승인 · 반려 | 「광고 승인」에는 팝업 탭이 없다(R-08). 「전체 광고」 `family=popup` 행은 행 조치 없이 상세로 간다 | 배달 › 사장님 팝업 신청 → 공통 화면 | L2 | business (`:225`, `advertisingWorkspaceFamilyActionRequirement` `:299`) | `platform_popup_owner_request.approve/reject` (운영 3·1건) | R-08 | 같음 |
| AD-107 | 사장님 팝업 | 가격 | 고칠 화면 없음 | 고칠 화면 없음 | — | — | — | O-7 (보류) | 같음 (결정대로 보류) |
| AD-108 | PTR | 만들기·수정·삭제 | 카드로 이동만 한다 | 플랫폼 운영 › PTR · 도메인 `?domain=` 바로가기 | 저장 L1 · 삭제 L3 (`AdminPtrRevealDetailWorkspace.tsx:165,630`) | ads (`:236`) | `platform_popup.*` 공용 | O-5 | 같음 |
| AD-109 | 피드 배너 | 만들기 | 「피드 배너 등록」 · 「+ 광고 등록」 → 거래/커뮤니티 배너 (`AdminAdsDirectRegisterHub.tsx:16-27`) | 바로가기 | — | ads (`:222`) | `feed_ad_campaign.create` | final §3-2 | 같음 |
| AD-110 | 피드 배너 (회원 신청) | 승인 | 광고 승인 → 상세 · API 조치 감사 = **`feed_ad.approve`** (`app/api/admin/advertising-workspace/action/route.ts:269`) | 신청 상세 PATCH 감사 = **`feed_ad_request.approve`** (`app/api/admin/feed-ad-requests/[id]/route.ts:337`) | L2 | ads | 두 이름이 다름 | reaudit N-05 | **다름** |
| AD-111 | 피드 배너 | 보상 연장 | 감사 = `feed_ad.extend_compensation` (`action/route.ts:208`) | 감사 = `feed_ad_request.extend_compensation` (`feed-ad-requests/[id]/route.ts:465`) | L2 | ads | 두 이름이 다름 | N-05 | **다름** |
| AD-112 | 피드 배너 | 정지·재개·종료 | 정지 L1 · 재개 L1 · 종료 L3 | 정지 L1 · 재개 L1 · 종료 L3 (`AdminFeedAdRequestDetail.tsx:232,250,261`) | 같음 | ads | `feed_ad_request.pause/resume/end` 두 곳 같음 (`action/route.ts:317,336,354`) | N-04 | 같음 |
| AD-113 | 피드 배너 | 반려 | 단일 구현 `adminRejectFeedAdRequest` | 같은 구현 | L2 | ads | `feed_ad_request.reject` | H-2 | 같음 |
| AD-114 | 피드 배너 | 순서 | — | 「우선순위」는 후보가 50개를 넘을 때만 쓰인다 | — | ads | — | O-9 (공정 회전 유지) | 같음 (결정대로) |
| AD-115 | 배달 배너 4종 | 만들기 | `/admin/advertising/direct/delivery` | 바로가기 | — | business | `delivery_ad_banner_image.upload` 등 | final §3-2 | 같음 |
| AD-116 | 배달 배너·매장 홍보 | 정지(L2 사유)·재개(L1)·종료(L3)·승인/반려(L2) | 공통 화면 `admin_delivery_ad_transition` | `/admin/delivery-ads/[id]` | 공통 화면은 확인함. 도메인 상세는 열어 보지 않음 | business (`:216`) | 도메인 감사 표 `DELIVERY_AD_AUDIT_LOG_TABLE` (`action/route.ts:26`) | CUT A §1 | 확인 못 함 (도메인 상세를 대조하지 않음) |
| AD-117 | 배달 배너 | 순서 | 광고 위치 (홈 상단만) | 바로가기 | — | business (`:233`) | 확인 못 함 | final §3-2 | 확인 못 함 |
| AD-118 | 배달 매장 홍보 | 만들기 | 정책상 금지 (`CREATE:"N"` `lib/ads/admin-authority-matrix.ts`) | — | — | — | — | CUT A §1 | 같음 |
| AD-119 | 배달 광고 | 환불 | 반려할 때만 환불. 진행 중 환불 CTA 없음 (`REFUND:"GAP"`) | 없음 | L3 (`refund`) | — | — | final §3-2 | 같음 (GAP 그대로) |
| AD-120 | 마이 배너 | 만들기·수정·숨김·삭제 | 카드로 이동만 한다 | 플랫폼 운영 › 앱 화면 구성 | 삭제 L3 (`AdminMyBannersPage.tsx:82`) | ads (`:240`) | `banner.*` (운영 6건) | O-5 | 같음 |
| AD-121 | 이벤트 · 사장님 이벤트 신청 | 만들기·수정·심사 | 카드로 이동만 한다 | 플랫폼 운영 · 도메인 바로가기 | 확인 못 함 | ads (`:227`) / 심사 business (`:231`) | 확인 못 함 | O-5 | 확인 못 함 |
| AD-122 | 거래 상위노출 | 정지 · 재개 | 상위노출 관리·전체 광고: 정지 = `sanction` L2 · 재개 = `exposeStart` L2 (`admin-mutation-confirm-copy.ts:46-61`) | 거래 상위노출: 중지 사유·재개 사유 입력창 (`TradePromotionsPage.tsx:410,416`) | L2 | 거래 (`:252`, `:301`) | `trade_promotion_order.pause/resume` | reaudit N-02·N-03 | 같음 |
| AD-123 | 거래 상위노출 | 종료(환급) | 귀책·환급 미리보기 폼 + **대상 재입력** (`AdminAdvertisingWorkspace.tsx:650-660,1840-1852`) | 귀책·환급 미리보기 + 사유. **대상 재입력이 없다** (`TradePromotionsPage.tsx:500-517`, `retypeValue` 없음) | 동작 표 = `forceCancel` L3 (사유 + 대상 재입력) | 거래 | `trade_promotion_order.end` | `admin-action-levels.ts` L3 정의 · H-1 | **다름** — 도메인 화면이 L3 의 재입력을 받지 않는다 |
| AD-124 | 커뮤니티 상위노출 | 정지 · 재개 · 종료 | 정지 L2 · 재개 L2 · 종료 L3(재입력) | 재개 L2 (`AdminCommunityPromotionsPage.tsx:106`) · 종료 사유 + 재입력 (`:380-393`) | 같음 | community promotion (`:268`, `:303`) | `community_promotion_order.*` | H-3 | 같음 |
| AD-125 | 거래·커뮤니티 상위노출 | 승인·반려·만들기 | 승인 없음 (회원이 결제하면 바로 시작) | 옛 승인 대기 행만 있음 (`TradePromotionsPage.tsx:367`) | L2 | 각 도메인 | — | final §3-1 「상위노출은 승인 없음」 | 같음 |
| AD-126 | 상품·가격 (상위노출) | 수정 | 「광고 상품/가격」 요약 + 이동 링크 (`products-control-model.ts:26`) | 거래 › 상위노출 가격 · 커뮤니티 › 상위노출 가격(같은 화면) | L2 (`pointPolicySave`) | API: 거래 + (커뮤니티 행이면) 커뮤니티 promotion (`app/api/admin/member-promotion-products/route.ts:114,142-143`) | `member_promotion_product.update` | A-2 · A-3 | **다름** — 저장 버튼이 권한을 보지 않는다. `disabled={locked}` (`AdminMemberPromotionProductsPage.tsx:191,235`)라서 권한 없는 사람이 눌러도 서버 403 이 난다 (N-09) |
| AD-127 | 상품·가격 (피드 배너) | 수정 | 「광고 상품/가격」 → `/admin/feed-ad-products` | 바로가기 | L2 | ads (`:237`) | 확인 못 함 | A-1 | 같음 |
| AD-128 | 모든 광고 | 이력 상세 | 「광고 이력」 행: 상위노출 → `/boosts?orderId=` (그 주문을 고름) · 배달 → `/admin/delivery-ads/{id}` (화면 있음) | — | — | 전원 | — | H-5 | 같음 (상위노출·배달) |
| AD-129 | 피드 배너 · 운영자 팝업 · 옛 사장님 팝업 | 이력 상세 | 피드 회원 신청 → `/admin/advertising/applications` (목록. id 없음) · 피드 운영자 등록·운영자 팝업 → `/admin/advertising/operations` (목록) · 옛 사장님 팝업 → `null` (`project-history-timeline.ts:479-483,899,1012`). 단건 화면 `/admin/feed-ad-requests/[id]`·`/admin/feed-ads/[campaignId]`·`/admin/platform-popup/[campaignId]` 는 있는데 쓰지 않는다 | — | — | — | — | reaudit N-08 | **다름** |

#### 권한·사유·감사 공통 규칙
| ID | 메뉴·경로 | 규칙 | 근거 | 지금 코드 위치(file:line) | 같은가 |
|---|---|---|---|---|---|
| AD-201 | 모든 광고 조치 | 같은 동작은 어디서나 같은 단계다. L1 = 확인 1번 · L2 = 확인 + 사유 2자 이상 + 감사 · L3 = L2 + 대상 재입력 | `admin-action-levels.ts:1-12` | 표 `:17-37` | 같음 (어긋나는 곳은 AD-103·AD-123) |
| AD-202 | L2·L3 사유 | 사유는 반드시 변경 API 로 보내고, 서버가 감사에 남긴다 | `admin-action-levels.ts:11` | 공통 화면 `action/route.ts:120-139` (승인·반려·보류·보상·종료·삭제 + 배달/상위노출 정지는 사유가 없으면 400) | 같음 |
| AD-203 | 공통 화면 조치 권한 | 광고 종류마다 서버와 같은 키를 쓴다. 배달·사장님 팝업 = business · 피드·운영자 팝업 = ads · 거래 = 거래 · 커뮤니티 = community promotion | CUT A §1 · G-01 | `admin-route-access.ts:296-312` · 서버 `action/route.ts:90-93,143,167` | 같음 |
| AD-204 | 공통 화면 버튼 권한 | 목록 행·상세 버튼도 권한이 없으면 사유를 받기 **전에** 막는다 | H-4 · S-2 | `AdminAdvertisingWorkspace.tsx:792-809` | 같음 (상위노출 가격 화면은 AD-126 다름) |
| AD-205 | 광고 화면 열기 | 조회는 활성 관리자 전원이 한다. 쓰기는 영역 키로 막는다 | `admin-route-access.ts` G-18 | `:107-108` (`/admin/advertising` ANY) · `:216-240` | 같음 |
| AD-206 | 감사 이름 | 같은 대상의 같은 조치는 화면이 달라도 감사 이름이 하나다 | reaudit N-05 | AD-110·AD-111 | **다름** (피드 승인·보상 연장. 운영 DB 에는 `feed_ad.approve`·`feed_ad_request.approve` 둘 다 0건이고 코드에서만 확인했다) |
| AD-207 | 감사의 변경 전 값 | 감사에 변경 전 값을 남긴다 | N-05 「before 값도 없다」 | 공통 화면 피드 승인 `before_json: null` (`action/route.ts:270`) · 정지·재개·종료는 `after` 만 (`:314-319`) | **다름** |
| AD-208 | 내부 메모 | 메모 저장은 사유나 확인 없이 하고, 별도 메모 저장소에 둔다 | A-9 | `action/route.ts:99-115` · `AdminAdvertisingWorkspace.tsx:745-748` | 같음 |
| AD-209 | 광고 이력 | 이력 화면에는 변경 동작이 없다 | 계약 표시 | `AdminAdsHistoryLedgerView.tsx:219-222` · `filterWorkspaceActionsByMode` history = [] | 같음 |

#### 문구·빈 화면·링크
| ID | 메뉴·경로 | 규칙 | 근거 | 지금 코드 위치(file:line) | 같은가 |
|---|---|---|---|---|---|
| AD-301 | 공통 화면 전체 | 한국어 화면에는 영어나 코드값을 쓰지 않는다 | H-7 · N-07 · Owner 「모든 문구 한국어」 | 「Admin 직접 등록」 `AdminAdvertisingWorkspace.tsx:1250` · 주문 선택 칩 「community/trade」 `:843` | **다름** |
| AD-302 | 광고 이력 | 같은 규칙 | 같음 | 「Popup (legacy owner)」 `project-history-timeline.ts:1007` · 「Admin 직접 등록」 `:36,290,538,791` · 「오너 신청」 `:538` · 「…mutation이 없습니다」 `AdminAdsHistoryLedgerView.tsx:221` | **다름** |
| AD-303 | 광고 상품/가격 | 같은 규칙 | 같음 | 「Admin 전용」 `lib/admin/ads-commercial/products-control-model.ts:584` | **다름** |
| AD-304 | 메뉴·구역 이름 | 상위노출 / 홍보 표기를 하나로 맞춘다 | H-7 | AD-009 | **다름** |
| AD-305 | 빈 목록 | 빈 목록에는 등록 버튼을 둔다. 권한이 없으면 꺼진 버튼과 이유를 보여 준다 | final §3-3 H-7 · S-3 「빈 목록 등록 6곳」 | `AdminAdvertisingWorkspace.tsx:1090-1113` (전체 광고·노출 관리만) | 같음 (승인·이력·상위노출 관리는 등록하는 화면이 아니라 버튼이 없다) |
| AD-306 | 「전체 광고」 바로가기 카드 | 인트로·PTR·마이 배너·이벤트 4개를 「노출 중 N개」와 「관리」로 보여 준다. 못 불러오면 「불러오지 못함」 | O-5 | `components/admin/ads/AdminAdsOtherSurfacesCards.tsx:38-49` · 마이 배너는 `status='active'` 로 센다 (`app/api/admin/advertising/other-surfaces/route.ts:32-34`) | 같음 (N-10: 고객 화면은 `is_active` 로 고른다. 지금은 0행이라 차이 없음) |
| AD-307 | 공통 화면 머리글 안내 | 이벤트·팝업·배너를 어디서 관리하는지 맞게 안내한다 | Owner 원래 요구 · O-5 | 「이벤트·팝업·배너 등 플랫폼 노출은 『플랫폼 운영』에서 관리합니다」 `AdminAdvertisingWorkspace.tsx:861-863` | 충돌 → AD-C02 |
| AD-308 | 이력 → 그 항목 | 「상세」는 그 항목 하나를 연다 | H-5 · N-08 | AD-129 | **다름** (피드·팝업) |

#### 근거끼리 충돌 · 근거 없음(Owner 결정 필요)
| ID | 내용 | 충돌하는 근거 둘 | 권장 |
|---|---|---|---|
| AD-C01 | 광고·배너 메뉴에 보이는 항목 수 | CUT J J-AMD-5 「광고·배너 \| unchanged (7 public + hidden legacy)」 ↔ 코드는 7개 + 바로가기 13개(재감사 Owner 승인 2026-10-30, `admin-menu.ts:1361`) | 코드(Owner 승인)를 정본으로 하고, CUT J 문서 표만 정정한다. 문서만 바꾸는 일이라 Owner 승인을 받는다 |
| AD-C02 | 공통 화면 머리글이 「플랫폼 노출은 플랫폼 운영에서 관리」라고 한다 | Owner 「공통적인 부분에서 모든 부분이 CTA 되는 관리」 · O-5 카드 ↔ `AdminAdvertisingWorkspace.tsx:861` 문구 | 문구를 「아래 카드에서 바로 이동」 뜻으로 고친다 (Owner 결정) |
| AD-C03 | 운영자 팝업 재개 단계 | 동작 표의 `resume` = L1 ↔ 팝업 상세는 재개를 「노출 시작」 `exposeStart` = L2 로 본다 | L2 로 통일한다. 거래·커뮤니티 재개가 이미 L2 이다 (Owner 결정) |
| AD-C04 | 이력 상세의 대상 | H-5 「이력 상세 = 그 항목」 ↔ 공통 화면 계약 「광고 승인 목록에는 행 조치가 없다」(CUT R3) | 이력 상세는 단건 화면(`/admin/feed-ad-requests/[id]`·`/admin/feed-ads/[id]`·`/admin/platform-popup/[id]`)으로 바로 연다. 결정할 것이 없고 결함 수정이다 |
| AD-C05 | 도메인 메뉴에서 만들기·순서 | 도메인 바로가기는 공통 화면을 `?domain=` 으로 여는 것만 정해져 있다(O-6①). 「만들기」가 도메인을 미리 고르는지는 근거가 없다 (`/admin/advertising/direct` 는 도메인을 받지 않음) | Owner 결정 필요 |
| AD-C06 | 공통 화면에서 인트로·PTR·마이 배너·이벤트를 정지·종료하는 CTA | O-5 는 「읽기 전용 카드 + 관리」로 정했다 ↔ Owner 「모든 부분이 CTA」 | O-5 대로 유지한다 (목록 행으로 넣으면 DB 조회 함수를 바꿔야 함). 다시 결정할지는 Owner 가 정한다 |
| AD-C07 | 광고 환불 CTA (배달 진행 중·피드) | 동작 표 `refund` = L3 는 있다 ↔ 매트릭스 `REFUND:"GAP"` 이고 환불 화면이 없다 | 근거 없음. Owner 결정 필요 |
| AD-C08 | 인트로 감사 이름 · 공통 화면 팝업 기간 변경 감사 | 계약에 이름이 정해져 있지 않고, 코드도 확인하지 못했다 | 이름 규칙(`대상.조치`)만 정하고, 실제 기록은 다음 단계에서 확인한다 |

**요약 (코드 기준 「다름」 9건):** AD-009 · AD-103 · AD-110/111/206 · AD-207 · AD-123 · AD-126 · AD-129/308 · AD-301~304.

이 중 N-05 · N-07 · N-08 · N-09 는 재감사(2026-11-04) P2 목록에 이미 있다. 지금 main 에서 아직 남아 있는 것을 확인했다.

**이번에 처음 찾은 것은 세 가지다.**
- AD-009: 커뮤니티 구역 제목이 아직 「홍보」다.
- AD-103: 팝업 재개 단계가 공통 화면 L1, 도메인 L2 로 다르다.
- AD-123: 거래 도메인 종료 화면이 L3 의 대상 재입력을 받지 않는다.

---
