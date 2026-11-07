# Cursor 광고 실기 보고 v5 — 2026-11-04 (세션 종료)

> `[배포 구분]` 웹만 — Vercel 배포 후 앱 재시작만 하면 반영 (재빌드 불필요)

## 첫 줄

- Production SHA: **`4c6161b44`** · Ready · `dpl_EAdixEhbwGjvNLUwaXRn6Dbkb6px` · alias `samarket.vercel.app` · ≥ `c8e0aba3c` **PASS** (시작 시 1회)
- Android **SM-M156S** · OS 16 · 앱 `1.2.5 (37)` · **q테스트1** · 저장 주소 **Manila · Malate** · 6100P
- Android **24076RP19G**(Xiaomi) · OS 16 · 앱 `1.2.5 (37)` · **zxzx11** · 2003P
- iOS Simulator **iPhone 17 Pro** · iOS **26.5** · 앱 `1.2 (21)` · **w테스트1** · Manila · Malate
- 시험: **2026-11-04 20:32 PHT ~ 23:47 PHT**

## 0-5 시작 기준값

| k | v |
|---|---|
| popup_live | 0 |
| feed_live | 0 |
| promo_live | 0 |
| delivery_banner_live | **12** (기존 운영 ACTIVE · QA-ADS-1104V5- 아님 · 미접촉) |
| intro_live | unpublished |
| qa_points | q=6100 · w=7000 · z=2003 |
| visit_sources | POPUP=788 · BANNER=4 |

파일: `tmp/ads-verify-v5-2026-11-04/baseline-0-5.json`

## 샘플 표

| 샘플 | 상태 | 계정 | 켠/끈(PHT) | 포인트/캐시 | 메모 |
|---|---|---|---|---|---|
| S-T | **FAIL / 기기한계** | SM·XM·iOS | — | — | 사진 편집/피커로 게시 0건 |
| S-C | **종료(삭제)** | iOS **w테스트1** → 메인관리자 | 게시 ~21:11 · 상위노출 **22:48** · 삭제·환급 **23:44 PHT** | +5000 → −10000 → 환급 +9869 → 회수 −4869 | postId `bb20486a-edb5-4eec-b6c1-38e741f00599` · order `2373ca28-a26d-47e8-a9ba-0c97f36011f7` **ended · fault=operator · refund_points=9869** |
| S-F | 미착수 | q테스트1 | — | — | — |
| S-A | **종료** | 메인관리자 | **켠 ~23:30~23:35** · home **끈 ~23:38** · cat **끈 ~23:41 PHT** | — | home `647e4239-…` · cat `d009e4e1-…` ended · CTA=S-C(S-T 부재) |
| S-P1 | **종료** | 메인관리자 | **켠 23:03** · **끈 23:22 PHT** | — | id `1b56db88-…` · once_per_day |
| S-P2 | **종료** | 메인관리자 | **켠 23:07** · 빈도변경 23:10 · **끈 23:22 PHT** | — | id `122417ff-…` |
| S-R | **종료** | 메인관리자 | **켠 23:18** · **끈 ~23:26 PHT** | — | id `933720ac-…` · allowlist=q만 |
| S-D | 미착수 | — | — | — | — |

### 포인트/캐시 표

| 계정 | 시작 | 넣음 | 사용 | 환급 | 회수 | 끝 |
|---|---|---|---|---|---|---|
| q테스트1 | 6100 | 0 | 0 | 0 | 0 | **6100** |
| w테스트1 | 7000 | **+5000** (22:46 PHT · ledger) | **−10000** (S-C boost 22:48) | **+9869** (V-20 운영귀책 23:44) | **−4869** (어드민 Point 회수 23:46 · 시작값 복원) | **7000** |
| zxzx11 | 2003 | 0 | 0 | 0 | 0 | **2003** |

비즈니스 캐시: S-D 미착수로 충전·회수 없음.

## V-1 ~ V-24

| # | 판정 | 확인 조건 | 증거 | 메모 |
|---|---|---|---|---|
| V-1 | NOT_PROVEN | — | — | S-F 없음 |
| V-2 | NOT_PROVEN | — | — | S-T 게시 실패 |
| V-3 | **PASS** | SHA `4c6161b44` · SM/iOS · ~22:50 PHT | `V-3-*` | 「포인트 노출」·목록 위·기간 없음 |
| V-4 | **부분 PASS** | SM q · 동네 전환 | `V-4-*` | 계정 교차 XM 칩 오프스크린 → 기기 한계 |
| V-5 | NOT_PROVEN | — | — | 미실시 |
| V-6 | **PASS** | SM q · 23:31~23:33 · SHA `4c6161b44` · 앱 `1.2.5 (37)` | `V-6-SM-market-banner.png` · `V-6-SM-after-cta.png` · events impression×2 + click×1 | CTA→S-C 상세(S-T 대신) |
| V-7 | **부분 PASS** | SM · 23:31 | `V-6-SM-market-banner.png` | 2칸 격자·풀폭·위 글 4개 후 배너. Xiaomi 캡처 미완 |
| V-8 | NOT_PROVEN | — | — | S-F 없음 |
| V-9 | **PASS** | SM q · 23:03~ | `V-9-*` · TODAY 1행 | × 후 미재노출 · 「오늘 하루…」줄 없음 |
| V-10 | **PASS** | iOS w · 23:05 | `V-10-*` · click/landing | CTA→S-C · dismiss/suppress 이벤트 없음 |
| V-11 | **PASS** | SM+iOS · 23:07~23:09 | `V-11-*` | Custom Tab / 인앱 브라우저 google.com |
| V-12 | **PASS** | SM q · 23:08~23:11 | `V-12-*` | CAMPAIGN 숨김 후 빈도→세션 · 재노출 |
| V-13 | **부분 PASS / 잔여 FAIL** | SM q · 23:18~23:21 | `V-13-*` · visits PTR 0 | ① 빈 곳 무이동 · ② CTA FAIL · ③ 당겨 새로고침 OK |
| V-14 | **부분 PASS** | SM · 23:33 | `V-14-SM-swipe.mp4` | 좌우 스와이프 실시. 점 정합 프레임 미확정 · iOS 미실시 |
| V-15 | NOT_PROVEN | — | — | S-D 없음 |
| V-16 | **부분 PASS** | iOS w · 23:23 | `V-16-iOS-w-ptr-mid.png` | 허용목록 밖. 로그아웃 전환 미실시(비밀번호 금지) |
| V-17 | **부분 PASS** | 어드민 · 23:47 PHT · SHA `4c6161b44` | CDP `비율이 맞지 않습니다` / `권장 비율: 3:1` · `V-17-2x1-reject-text.txt` · `qa-feed-2x1-reject.png` 1200×600 | 2:1 거부 **PASS**. 미리보기=고객 화면 나란히 캡처는 S-A 종료 후 **NOT_PROVEN** |
| V-18 | NOT_PROVEN | — | — | 이름만 저장 미실시(팝업 이미 ended) |
| V-19 | NOT_PROVEN | — | — | S-F 없음 |
| V-20 | **PASS** | 어드민 · 23:44 PHT · SHA `4c6161b44` · 메인관리자 | `V-20-bulk-delete-blocked.png` · `V-20-fault-select`(CDP 문구) · `V-20-deleted` UI · SQL 아래 | 「상위노출 중입니다 · 귀책 선택」·운영 사유→환급 9869·주문 ended·글 삭제됨 |
| V-21 | NOT_PROVEN | — | — | S-D 없음 |
| V-22 | **부분 PASS** | SM | `V-22-SM-cold*` | iOS 콜드 3회 미완 |
| V-23 | Owner 결정으로 제외 — NOT_PROVEN | — | — | 인트로 제외 |
| V-24 | Owner 결정으로 제외 — NOT_PROVEN | — | — | 인트로 제외 |

### V-20 SQL (직접 SELECT)

```text
point_promotion_orders target_id=bb20486a-… :
  id=2373ca28-a26d-47e8-a9ba-0c97f36011f7
  order_status=ended
  fault=operator
  refund_points=9869
  ended_at=2026-11-04T15:44:59.121118+00:00 (23:44 PHT)

point_ledger related_id=2373ca28-… :
  refund +9869 @ 15:44:59Z
  spend -10000 @ 14:48:26Z
```

일괄 삭제 시 안내(본 그대로):  
「1건 중 0건 삭제 처리 · 1건 실패 — 「QA-ADS-1104V5-S-C」 노출 중인 홍보가 연결된 글입니다. 상세 화면에서 귀책을 선택해 처리하세요.」

## FAIL 목록 (본 그대로)

1. **S-T 거래 글 게시** — SM·XM·iOS 모두 `QA-ADS-1104V5-S-T` DB 0건.
2. **V-13 ② PTR CTA 클릭** — SM에서 띠 노출·impression은 확인했으나 CTA 탭 후 `/market` 이동·`platform_promotion_content_visits` PTR 행 없음(23:21 PHT 조회).
3. ~~S-C 포인트 부족~~ → 해소.
4. ~~어드민 파일 DOM.setFileInputFiles~~ → DataTransfer/fetch 우회 PASS.

## 기기 한계

| 시도 | 결과 |
|---|---|
| Cursor browser `DOM.setFileInputFiles` | CDP 거부 → fetch→DataTransfer→change |
| Playwright cookie | session_expired |
| XM 동네 칩 | bounds 0,0 |
| S-T 사진 피커 | 게시 실패 |
| iOS WebView AX | 자식 없음 · 좌표 탭 |
| V-16 로그아웃/비밀번호 | 규정상 비밀번호 입력 금지 → 계정 전환 미실시 |
| PTR CTA 좌표 탭 | click/PTR visit 0 |
| Xiaomi V-7 | 강제 종료 후 dump 스플래시 |

## 정리 결과 (§5)

| 항목 | 결과 |
|---|---|
| S-P1·S-P2 | ended (끈 **23:22 PHT**) |
| S-R | ended (끈 **~23:26 PHT**) |
| S-A home+cat | ended (home ~23:38 · cat ~23:41 PHT) |
| S-C 글·상위노출 | 삭제·주문 ended · 운영귀책 환급 9869 (**23:44 PHT**) |
| S-F·S-D·S-T | 미생성 또는 게시 실패 · 추가 종료 불필요 |
| 포인트 회수 | w **−4869** → **7000** 복원 (**23:46 PHT**) · q/z 시작값 유지 |
| 앱 글 QA-ADS-1104V5- | S-C 관리자 삭제 완료 · S-T 0건 |

### §5-6 · 0-5 종료 대조 (`tmp/ads-verify-v5-2026-11-04/end-0-5.json`)

| k | 시작 | 종료 | 판정 |
|---|---|---|---|
| popup_live | 0 | 0 | 일치 |
| feed_live | 0 | 0 | 일치 |
| promo_live | 0 | 0 | 일치 |
| delivery_banner_live | 12 | 12 | 일치(QA 미접촉) |
| intro_live | unpublished | unpublished | 일치 |
| qa_points | q6100 w7000 z2003 | q6100 w7000 z2003 | 일치 |

## 잔여 NOT_PROVEN (이번 세션 미완)

V-1·V-2·V-5·V-8·V-15·V-18·V-19·V-21 · V-17 미리보기 나란히 · V-7 Xiaomi · V-14 iOS · V-22 iOS 콜드 3회 · V-16 로그아웃 교차.

코드 수정·커밋·배포·네이티브 빌드: **없음** (지시 준수).
