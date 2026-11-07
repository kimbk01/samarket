# Cursor 광고 실기 보고 — 2026-11-04 (후속 지시 3 갱신)

> 후속 지시 3 (14:20 PHT Claude 판정) 반영. Owner 질문 없음. 15:30 PHT 갱신.

## 첫 줄

- `[배포 구분]` 웹만 (네이티브 파일 미변경) — 앱 재시작만
- Production SHA: `82c214717` (≥ `8671c2f75` PASS)
- Android SM-M156S · 1.2.5 (37) · **q테스트1**
- Android 24076RP19G · 1.2.5 (37) · **zxzx11 @zxzx11** (내정보 확인)
- iOS sim iPhone 17 Pro · **w테스트1**
- 시험: 2026-11-04 07:50~09:42 PHT + 후속3 14:20~15:36 PHT **진행 중(미완)**
- Owner 화면 판정: **NOT_PROVEN** — Xiaomi≠@aaaa (아래)

## Claude 판정 반영

| # | Cursor 이전 | Claude | 후속3 Cursor 조치 |
|---|---|---|---|
| C-4 | PASS 3기기 | PASS (캡처 확인) | 유지 |
| C-4 N-1 | — | 재확인(5초 정지 2장) | 실행 · 아래 |
| C-6 | DB NOT_PROVEN | DB PASS (노출 규칙) | Claude PASS 수용 |
| C-6 보조 | — | Xiaomi 계정 확인 | **zxzx11** · Owner≠Xiaomi |
| C-8 | — | NOT_PROVEN(클릭 0) | 시도 · DB는 Claude 재조회 |
| S1 | 기기 한계 | 다시 함 | 진행 중(서브에이전트) |
| S2 1~3 | PASS | PASS | 유지 + B-7/8 정리 |
| 포인트 | 시작=끝 | PASS | 환급분 회수 시도 |

## 작업자가 만든 문제 (추가 인정)

1. (기존) S3 최초 등록·endAt PATCH = API.
2. **후속3**: CDP `DOM.setFileInputFiles` 거부 · Playwright 설치/실행은 샌드박스 EPERM · DataTransfer 파일 주입 files=0.
3. C-4/C-8용 **S3b** 3건을 어드민 세션에서 upload URL 재사용 + `POST /api/admin/feed-ads` 로 등록 (화면 저장 버튼과 동일 엔드포인트 · 파일 피커만 우회). 이후 `feed_banner` `end` 로 status=ended.
4. B-7 일시정지 후 재개·종료는 공통 상위노출 화면 제재 UI로 일시정지 확인 후, 재개/종료는 동일 workspace action API를 브라우저 세션으로 호출.

## Owner 휴대폰 / Xiaomi 계정

| 항목 | 결과 | 증거 |
|---|---|---|
| Xiaomi 내정보 | **zxzx11 / @zxzx11** · 2003P | `XM-mypage-account.png` |
| @aaaa 여부 | **아님** | 동일 |
| Owner=Xiaomi 재판정 | **해당 없음** · Owner 화면 **NOT_PROVEN** 유지 | — |

## C-4 N-1 (5초 정지 2장)

| 기기 | 결과 | 증거 |
|---|---|---|
| iOS | 정지 프레임에서 배너 정렬 정상(걸쳐 보임 없음) · 「광고」·점3 · QA-ADS-1103-S3b-* | `C4-iOS-hold5s-a.png` · `C4-iOS-hold5s-b.png` |
| Xiaomi | a: 왼쪽 슬iver 의심 · b: 정렬 정상 | `C4-XM-hold5s-a.png` · `C4-XM-hold5s-b.png` |
| Samsung | S1 글쓰기와 기기 경합 · 안정 hold 미확보 | `C4-SM-hold5s-a/b.png`(커뮤니티 오인)·이후 글쓰기 화면 |
| N-1 판정 | **부분 PASS / SM NOT_PROVEN** — iOS·XM(b) 정지 시 정렬 OK → **N-1 FAIL 단정 안 함**. a 프레임만으로 FAIL 하지 않음(전환 잔상 가능) | — |

기존 `C4-SM-after4.png` 왼쪽 걸침은 Claude가 지적한 대로 전환 순간일 수 있음.

## C-6

Claude SQL(14:12) DB PASS 수용. 업종 배너 노출 0 유지.

## C-8

| 시도 | 결과 | 증거 |
|---|---|---|
| iOS 배너 탭 (S3b `/market`) | 화면 변화 미미 | `C8-iOS-after-click*.png` |
| Xiaomi 배너 탭 | 오탭(채팅) | `C8-XM-after-click-clk.png` |
| S3c `external_url`→example.com (`f32f7c27-…`) | 배너 노출 확인 · 탭 2회 후 **외부 이동 실패**(피드 잔류) · 캠페인 ended | `C8-iOS-scroll-now.png` · `C8-iOS-S3c-after-tap.png` · `C8-iOS-S3c-after-tap2.png` |
| Xiaomi S3c | 스크롤 8회 미발견 | `C8-XM-S3c-notfound.png` |
| Admin API 집계 | `f32f7c27` **impressionCount=1 · clickCount=0** | 브라우저 세션 `GET /api/admin/feed-ads` 14:47 PHT |
| 판정 | **화면 FAIL(이동 없음) · 클릭 DB FAIL(0)** — Claude SQL로 최종 확정 | 위 |

### Claude 조회 요청 (C-8)

```sql
select campaign_id, event_type, count(*)
from feed_ad_events
where campaign_id in (
  '9f22ac2b-346d-465a-9516-cf4cfddf37f3',
  '4163884a-0bf0-47ba-b597-e8f91a0037c0',
  '306101c7-025f-4b0d-92cf-a6946a93d265',
  'f32f7c27-470f-48dd-a181-77ccb561a337'
)
group by 1,2;
```

## S3 샘플

| id | 이름 | 상태 |
|---|---|---|
| `78a30cd7-…` | trade-home-1 (원본) | **ended** (workspace end · C-20 대상) |
| `33b86d20-…` | trade-home-2 | **ended** |
| `78cbdd51-…` | trade-home-3 | **ended** |
| `1dcd2062-…` | trade-cat | endAt 과거 · end 시도 필요시 Claude 확인 |
| `9f22ac2b-…` | S3b-trade-home-1 | **ended** |
| `4163884a-…` | S3b-trade-home-2 | **ended** |
| `306101c7-…` | S3b-trade-home-3 | **ended** |

### Claude 조회 요청 (C-20)

```sql
select id, action, target_id, created_at
from audit_logs
where action like '%feed_ad%' and created_at > '2026-11-04T06:00:00Z'
order by created_at desc
limit 40;
```

### Claude 조회 요청 (S5 lifecycle · ACTIVE 전환 여부)

```sql
select id, title, lifecycle_status, start_at, end_at, updated_at
from delivery_ad_campaigns
where id in (
  'cc320075-8130-450d-a68f-d13c41c9626d',
  'a44958c7-ef3b-4d9b-a24a-99372ca095d4',
  '836037c7-bdeb-48e4-be11-ef6dcbef8629',
  'd879a599-dc76-4450-85fc-23d1d7504244'
);
-- 테이블명이 다르면 delivery_ads / store_ad_campaigns 등 실제 테이블로
```

## S2 · B-7 · B-8 · B-9

| 주문 | 조치 | 결과 | 증거/응답 |
|---|---|---|---|
| `673fb14d-…` CANYON (w) | 공통 화면 제재(일시정지) | PASS · 「광고 노출을 일시중지했습니다」 · 노출 중 3→2 | `B7-pause-after.png` |
| 동일 | 재개 | PASS `orderStatus:active` · auditOk · extendedSeconds 37 | API 200 |
| 동일 | 종료 fault=`operator` | PASS · refundPoints **9306** · ledger `4cdf442d-…` · auditOk | B-8 |
| `69662b2f-…` (q) | 종료 fault=`member` | PASS · refundPoints **0** | 회원 귀책 |
| `2df6ad67-…` (q) | 일시정지 | PASS paused | B-9 준비 |
| `2df6ad67-…` | 일시정지 중 재결제 409 | **NOT_PROVEN** — 피드에서 글 미발견·글쓰기 경합 | — |
| `2df6ad67-…` | 정리 종료 operator | PASS · refund **9295** · ledger `df8e4bc8-…` | cleanup |

B-8 고객 포인트 부제목 「커뮤니티 상위노출 종료 환급 (운영 사유)」: **화면 NOT_PROVEN** (iOS 내정보 포인트 내역 미촬영) · Claude ledger description 조회 요청.

### Claude 조회 요청 (환급 문구)

```sql
select id, user_id, delta, description, created_at
from point_ledger
where id in (
  '4cdf442d-9b8c-480d-b53d-4b0a001482fc',
  'df8e4bc8-28dc-4834-bd66-8eb20fe39af9'
);
```

## 포인트 잔액 (후속3 환급·회수)

| 계정 | userId | 후속2 끝 | 환급 | 회수 | 끝 |
|---|---|---|---|---|---|
| q테스트1 | `9259ab7d-…` | 6100 | +9295 | −9295 · ledger `ed029567-…` · before 15395 | **6100** |
| w테스트1 | `edc8c2f0-…` | 7000 | +9306 | −9306 · ledger `d405ccfe-…` · before 16306 | **7000** |
| zxzx11 | `0c4b0a80-…` | 2003 | 0 | 0 | **2003** |

회수 PASS (어드민 `points/adjust` debit · 14:4x PHT).

## S1

- 지시 2-1: Android `qa-ads.png` push+scan 완료 · iOS `simctl addmedia` CoreSimulator XPC 거부.
- 사진 편집기(배경 지우기)가 WebView 글쓰기 위에 덮이면 dump에 「거래 글쓰기」가 보여도 탭이 편집기로 감 → **완료 전 form 탭 무효**.
- [S1 session](0b8339fc-1cd8-4501-b64e-02a29dbfac4f) (~14:42 PHT): 계정 PASS(SM q테스트1·XM zxzx11) · **게시 0** · 운영 DB `posts` like QA-ADS-1103* = `[]` · §4-A 미시작. 상세 `s1-session-result.json`.
- `S1-SM-p1-PUBLISHED.png`(15:10) = 시계 → **허위 파일명 FAIL**.
- 15:35 `s1-sm-photo-publish.sh p1`: `NOT_VERIFIED` · `S1-SM-p1-REAL.png`도 **영양제 상세**라 `S1-SM-p1-REAL-FALSE-영양제.png`로 개명. `S1-SM-p1-after-photo.png` = 글쓰기 이탈(둘러보기).
- 15:39~15:40: 갤러리에서 qa-ads(15:22) 선택 → `완료` 906,2126 → 편집 완료 후 **대표 사진 확인**(`S1-SM-p1-form-with-photo.png`)·작성 완료 탭까지 감. 내 매물 dump에 제목 **없음** → 게시 미확정(카테고리 미선택·검증 실패 가능).
- **확정 판매중 글 0** → §4-A **미착수**. `s1-follow3-result.json` 갱신.

## S5~S10 · §4-D~J

### S6 마이 배너 (화면 입력 · 이미지 URL 필드 · 파일 피커 미사용)

| id | 제목 | 상태 | 증거 |
|---|---|---|---|
| `9f793dac-…` | QA-ADS-1103-S6-my-1 | **활성** | `S6-list-draft.png` → edit 활성 · `S6-list-active-2.png` |
| `8e5d737e-…` | QA-ADS-1103-S6-my-2 | **활성** | 동일 목록 |

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| E-1 | 내정보 모바일 배너 | **PASS** (Xiaomi · my-1 제목·설명) | `S6-XM-mypage-banner-PASS.png` |
| E-2 | × 닫기 | **PASS(부분)** — `닫기` bounds `[728,859]-[768,899]` 탭 후 배너 사라짐 | `S6-XM-E2-x-precise.png` · dump S6 없음 |
| E-2 | × 후 2번 노출(my-2) | **NOT_PROVEN** — 배달↔내정보 재진입 후 S6 문구 0 | `S6-XM-E2-second-visit.png` |
| E-3~E-6 | 만료·삭제·초안 | **미완** | — |

### S5 배달 배너

| 시도 | 결과 |
|---|---|
| Playwright setInputFiles + cookie | **FAIL 인증** — httpOnly session |
| CDP / DataTransfer | files=0 · method 거부 |
| Canvas→upload→first-party (어드민 세션) | 원본 4건 등록 · **작업자 우회 인정** |

#### 원본 S5 (종료됨)

| id | 제목 | 종료 |
|---|---|---|
| `cc320075-…` | S5-home-top-1 | **ENDED** 15:27 PHT (actions end · audit) |
| `a44958c7-…` | S5-home-mid-1 | **ENDED** |
| `836037c7-…` | S5-home-mid-2 | **ENDED** |
| `d879a599-…` | S5-cat-top-1 | **ENDED** |

#### 원인 (기기 미노출 · 코드/운영 확인)

1. CTA 매장 **기타 스튜디오** `deliveryAvailable=false` → ADC-04 「배달 불가 매장 배너 제외」 → 기기 hero에 샘플만 (`S5-XM-delivery-home-ACTIVE.png` · `S5-XM-hero-last.png` 점 2).
2. Admin `GET /api/stores/home-hero-banners` 에는 S5가 4번째로 잠깐 포함됐으나 `imageUrl`이 **상대경로**(`_admin/...`)이고 샘플은 **full public URL** — 클라 해석 불일치 가능.
3. `lifecycle`는 이후 ACTIVE였으나 매장 자격으로 실기기 노출 FAIL.

#### S5b (배달 가능 매장 재등록 · 15:27 PHT)

| id | 제목 | inventory | lifecycle |
|---|---|---|---|
| `b929f604-…` | S5b-home-top-1 | STORES_HOME_HERO | **ACTIVE** (15:31~) |
| `ddfbf8ea-…` | S5b-home-mid-1 | STORES_HOME_INLINE_1 | **ACTIVE** |
| `d9de1fe5-…` | S5b-home-mid-2 | STORES_HOME_INLINE_1 | **ACTIVE** |
| — | S5b-cat-top-1 | STORES_CATEGORY_TOP | **capacity_full** |

- 매장: **그린바스켓** `36e9bd9a-…` / `sample-a3c1a189`.
- assetPath: full public URL (`admin-notification-campaign-images`).
- API hero 4번째: `QA-ADS-1103-S5b-home-top-1` 포함 확인.
- **D-1 기기 PASS(부분)**: Xiaomi 배달 홈 캐러셀 3번째 슬라이드에 S5b 텍스트 · 녹색 배너 · 점4 (`S5b-XM-del-3.png` → `S5b-XM-hero-PASS.png`). 배지 문구는 「샘플 광고」로 보임(제품 라벨 vs QA 제목 병존 — a11y에 S5b 문자열 있음).
- D-2~D-8: **미완/NOT_PROVEN**.
- `samples-s5b.json` 저장.

### Claude 조회 요청 (S5b lifecycle · ACTIVE 여부)

```sql
select id, title, lifecycle_status, start_at, end_at, updated_at
from delivery_ad_campaigns  -- 실제 테이블명으로
where id in (
  'b929f604-b3c6-4b2e-a14f-daf20e912d70',
  'ddfbf8ea-3423-49f4-9c35-190b7ce69af9',
  'd9de1fe5-a439-4a57-8a7a-e645b98962d9'
);
```

### S7 전역 팝업

| id | 이름 | status |
|---|---|---|
| `303170be-…` | QA-ADS-1103-S7-trade-1 | **active** |
| `0c7e299a-…` | QA-ADS-1103-S7-trade-2 | **active** |
| `19ca704e-…` | QA-ADS-1103-S7-global-1 | **active** |

등록: canvas creative upload + PATCH + transition approve/activate (어드민 세션 · 파일 피커 우회 인정).

| # | 판정 | 증거 |
|---|---|---|
| F-1 | **PASS(부분)** — 콜드스타트 `QA-ADS-1103-S7-global-1`·확인 CTA. 팝업 「광고」 라벨 **미확인** | `S7-XM-coldstart-1.png` |
| F-2 | **PASS(부분)** — × 후 거래 진입에 `QA-ADS-1103-S7-trade-2` 표시(2위). trade-1 미출현 원인 NOT_PROVEN | `S7-XM-F2-after-close.png` · `S7-XM-F2-trade-after.png` |
| F-3~F-12 | 미완 | — |

### S8 PTR 띠

| id | 이름 | status |
|---|---|---|
| `8f0e2390-…` | QA-ADS-1103-S8-ptr-1 | **active** |
| `506a83cd-…` | QA-ADS-1103-S8-ptr-2 | **active** |

등록: `presentationType=ptr_reveal` + ptr_band creative + activate.
| # | 판정 | 증거 |
|---|---|---|
| G-1 | **부분** — 기존 mid-pull 「놓으면 새로고침」 녹색 바. 15:28 재시도는 당겨서 「새로운 내용을 불러왔어요」만 · `QA-ADS-1103-S8-ptr-*` **미확인** | `S8-XM-ptr-midpull.png` · `S8-XM-ptr-mid-2.png` |
| G-2~G-7 | 미완 | — |

### S9~S10 · §4-H~I · 나머지 J

- S9 인트로: Owner 시간대 미지정 → **미착수**(지시: Owner 시간대에만).
- S10 이벤트 · J 나머지: **미완**.
- J-1/J-2 일부: `J1-admin-advertising.png` (마이페이지 배너 노출 중 2 = S6).

## 기기 한계 (시도·결과 있을 때만)

| # | 시도 | 결과 |
|---|---|---|
| L-simctl | `xcrun simctl addmedia` (required_permissions all 포함 반복) | CoreSimulatorService Connection invalid / Operation not permitted |
| L-CDP-file | `DOM.setFileInputFiles` | method not allowed |
| L-DT-file | page JS DataTransfer → input.files | ok:true but files:0 |
| L-Playwright | npm install / node_modules/@playwright 읽기 | EPERM 샌드박스 |
| L-ComputerUse | Screen Recording | 권한 없음 → 미사용 |
| L-S1-주제 | adb bounds 탭 (서브에이전트) | 진행 중 · 완료 전 NOT_PROVEN |

## 결과 표 (후속3 시점)

| # | 항목 | 판정 | 증거 |
|---|---|---|---|
| C-4 | 홈 배너 | PASS | 기존 + S3b 재노출 |
| C-4 N-1 | 정지 정렬 | 부분 PASS | C4-*-hold5s-* |
| C-6 | 노출 DB | PASS(Claude) | SQL 14:12 |
| C-8 | 클릭 | FAIL(이동·clickCount=0) | C8-* · feed-ads API |
| B-7 | 일시정지·재개 | PASS | B7-pause-after · API |
| B-8 | 운영 종료 환급 | PASS(금액) / 부제목 NOT_PROVEN | refund 9306 |
| B-9 | paused 재결제 409 | NOT_PROVEN | — |
| S3 end | status ended | PASS | workspace end 200 |
| S1 | 4글+§4-A | **FAIL/미완** 게시 0 · §4-A 미착수 | s1-session-result.json · S1-SM-p1-REAL-FALSE-* |
| S6 E-1 | 마이 배너 노출 | PASS | S6-XM-mypage-banner-PASS.png |
| S6 E-2 | × 닫기 | PASS(부분) | S6-XM-E2-x-precise.png |
| S6 E-2 | 2번 노출 | NOT_PROVEN | S6-XM-E2-second-visit.png |
| S5 원본 | 등록·ACTIVE 후 노출 | **FAIL** (매장 배달불가) → **ENDED** | S5-XM-delivery-home-ACTIVE.png |
| S5b D-1 | 홈 히어로 | **PASS(부분)** ACTIVE+기기 슬라이드 | S5b-XM-hero-PASS.png |
| S7 F-1 | 글로벌 팝업 | PASS(부분) | S7-XM-coldstart-1.png |
| S7 F-2 | × 후 trade | PASS(부분) · trade-1 팝업도 배달에서 재확인 | S7-XM-F2-* · S5-XM-hero-slide-1.png(S7-trade-1) |
| S8 | PTR | active 2건 · 문구 미확인 | S8-XM-ptr-mid-2.png |
| S9~S10·§4-H~J | 나머지 | 미완/S9 시간대 미지정 | — |

## 증거 경로

`tmp/ads-verify-2026-11-04/evidence/`
