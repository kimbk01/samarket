# 광고 작업 인수인계 (2026-11-05 PHT 기준)

> **읽는 순서**: §0 지금 상태 → §1 Owner 가 원하는 것 → §2 작업 규칙 → §8 남은 일.
> 이력이 필요할 때만 §3~§7 을 본다.
>
> **판정 표기**
> - 코드 PASS = 시험·타입 검사 통과
> - 운영 확인 = 운영 DB SELECT·공개 API 로 확인
> - 실기 = 기기 화면으로 확인
> - 확인하지 못한 것은 NOT_PROVEN

---

## 0. 지금 상태 (한눈에)

| 구분 | 상태 |
|---|---|
| **main / Production** | main `c8e0aba3c` 이후(다른 세션 커밋 포함, 현재 origin/main `c168655fd`). 광고 마지막 커밋 `c8e0aba3c` 의 Production 배포 `dpl_7TMfbDvevMfipPLCKK8JaXfLk56t` = **READY** (2026-11-05 확인). Cursor 실기는 `4c6161b44`(그 이후 배포)에서 했다 |
| **운영 DB** | 광고 마이그레이션 **9건 모두 적용 완료**. 적용 전 롤백 시험은 전부 ROLLBACK_OK, 적용 후 함수 본문이 파일과 같은지 md5 로 대조했다(§5) |
| **운영 데이터** | QA 광고 8건(11-03 실기 잔여)을 **종료·숨김 처리했다**(§6). v5 실기 샘플도 Cursor 가 정리했다(진행 중 팝업·피드·상위노출 0) |
| **코드 검증** | 타입 검사 2종 오류 0 · eslint 오류 0 · verify 9개 PASS · 광고 관련 117파일 993개 PASS. 전체 vitest 실패 7파일·32개는 기준 main `b45649353` 에서도 똑같이 실패한다(별도 폴더에서 재현 확인). 이번 변경으로 늘어난 실패는 0 |
| **실기** | v5 프롬프트로 Cursor 가 1회 실행(11-04 20:32~23:47 PHT)했다. **22개 중 PASS 8 · 부분 PASS 6 · FAIL 1(V-13 PTR CTA) · NOT_PROVEN 7**. 인트로 2개는 Owner 결정으로 제외했다(§7) |
| **가장 먼저 할 일** | ① **V-13 PTR CTA 를 눌러도 이동·클릭 기록이 없는 결함** — 원인을 확정한 뒤 설계안을 올리고 승인받는다 ② v5 실기 잔여 NOT_PROVEN 항목 ③ Owner 결정 대기 항목(§8-3) |

---

## 1. Owner 가 원하는 것

### 1-1. 최종 목표

- DIBAY 광고 전체를 **정확하고 일관되게 운영할 수 있는 완성된 구조**로 만든다.
  - 대상: 인트로 · 전역 팝업 · PTR(당겨서 새로고침 띠) · 피드 배너(거래·커뮤니티) · 배달 배너·매장 홍보 · 마이 배너 · 이벤트 배너 · 거래/커뮤니티 상위노출 · 어드민
- 「광고를 많이 만드는 것」이 목표가 아니다. **기존 계약을 중심으로** 결함을 없애는 것이 목표다.
- Owner 원문(11-04) 요지:
  - 어드민 설정과 각 광고 영역의 연동을 정확히 감사한다.
  - 레거시와 동일한 조건을 원한다.
  - 땜방이 아니라 정확히 감사해서 구현한다.
  - 각 영역은 SSOT 지만 **전체 SSOT** 도 필요하다.
  - UI·UX·CTA 기본 계약이 겹치거나 빠지지 않게 한다.

### 1-2. Owner 가 확정한 정책 (바꾸지 않는다)

| 주제 | 확정 내용 | 출처 |
|---|---|---|
| 커뮤니티 상위노출 표시 | 일반 글과 같은 카드 + 배경 + 「포인트 노출」(영어 Promoted). 남은 기간은 본인만 본다(목록·상세·응답에 없음). 위쪽 3개 고정, 4번째부터 일반 자리 | 11-04 지시 · 「배경+글자(권장)」 |
| 제3자 비공개 | 종료일·남은 시간·구매 기간·결제액·연장 내역·노출수·관리자 메모는 광고주 본인과 권한 있는 관리자만 본다. CSS 로 숨기는 것이 아니라 API·RLS 에서 막는다 | 11-04 보완 지시 원칙 2 |
| 목적지 | 광고마다 목적지를 분명히 정한다. 없음·삭제·비공개·만료면 노출하지 않는다. 홈으로 보내거나 아무 반응이 없게 두지 않는다 | 원칙 3 |
| 관리자 통제 | 등록~삭제 12개 기능을 둔다. 삭제는 초안이면서 이력 0일 때만 하고, 나머지는 종료·보관한다. 원장·감사 이력을 보존한다 | 원칙 4 |
| 판정 순서 | Owner 확정 → 마스터 계약 → 운영 코드·DB → 확인된 레거시 → 플랫폼 정책 | 원칙 5 |
| D-1~D-30 | 22건 권장안대로, 조건부 7건(D-3·4·5·7·10·13·17), 변경 1건(D-21: 요청 제한 유지 + 최소 장치). 전체 표는 `ads-screen-behavior-spec-2026-11-04.md` §3 | 11-04 |
| E-2 | 운영자 팝업은 기간만 바꿀 때 재검토로 보내지 않는다 | 「설계안대로 구현」 |
| 11-04 최종 결정 8개 | ① 유료 광고 식별 유지, 「포인트 노출」 유지 ② 다른 영역 배너는 유지하고 같은 위치의 의도하지 않은 중복만 막음 ③ 인트로 기존 기능·OS Start 우선·단일 handoff 유지 ④ 마이 배너 닫기 기존대로 ⑤ 인트로·이벤트 성과는 신규 수집 없음 ⑥ 노출 정의는 종류별 기존 기준 ⑦ 팝업 「오늘 하루 보지 않기」 추가 금지(Owner FINAL) ⑧ 팝업 대상·빈도 기존 의미 유지, 「닫기만」·「앱 실행당 1회」 통합 금지 | 「Owner 최종 결정 및 마무리 지시」 |
| 실기 범위 | 인트로 실기 제외(운영 전체 노출이 필요하므로) | 「인트로 제외」 |

---

## 2. 작업 규칙 (이 작업에서 Owner 가 반복해 강조한 것)

1. **모든 문구는 한국어** — 보고·중간 메시지·wrap_up·버튼까지. 영어로 쓰면 Owner 가 강하게 지적한다(여러 번 지적받음).
2. **실기 → 수정 → 실기를 반복하지 않는다.** 원인을 확정한 뒤 설계안을 보고하고, 승인을 받고, 한 번에 구현하고, 실기는 1회만 한다. 땜빵을 금지하고, 「남은 것」으로 미루지 않는다.
3. **실기는 Cursor 담당**이다. Claude 는 Cursor 프롬프트를 만들고 결과를 운영 DB·캡처로 대조한다. Cursor 가 할 수 있는 일(샘플 생성·포인트·어드민 조작)을 Owner 에게 미루지 않는다.
4. **허위 보고 금지.** 직접 본 증거가 있을 때만 PASS 라고 쓴다. 코드 PASS ≠ 운영 PASS ≠ 실기 PASS. 내가 만든 잘못은 보고 맨 앞에 쓴다.
5. **범위 고정.** 지시 밖 결함은 보고만 한다. 새 기능은 넣지 않는다.
6. **운영 DB 변경·운영 데이터 변경은 Owner 별도 승인**을 받는다. 적용 전에 롤백 시험(`RAISE EXCEPTION` 으로 되돌리는 DO 블록)을 한다.
7. **main 은 작업당 1회**만 반영한다(fast-forward). CI·배포를 반복 확인하지 않는다(Production 은 1회만 확인).
8. 테스트 DB(`dibay-test`·`dibay-reset-qa`)는 쓰지 않는다. 운영 = `ckdosyydvgzqwpbwuhon`.
9. 시간은 PHT 로 적는다. DB 는 UTC 이다.

---

## 3. 진행 이력 (시간 순)

| 시점 (PHT) | 단계 | 결과 |
|---|---|---|
| 11-03 | 광고 전수 감사 → Owner 결정 O-1~O-10 → 1~4단계 구현, DB 3건, S-0~S-3, 피드 배너 수용량 트리거, QA 이벤트 배너 15건 종료 | 커밋 §4-1 |
| 11-04 새벽 | 전체 재감사(`ads-full-reaudit-2026-11-04.md`) → **P0·P1 수정 + Owner 결정 1~4** | `8671c2f75` |
| 11-04 오전 | Cursor 실기 v2·v3(USB Android + iOS 시뮬레이터) | 일부 PASS · 대부분 NOT_PROVEN |
| 11-04 16:00 | 커뮤니티 상위노출 표시 재설계(배경+「포인트 노출」·남은 기간 비공개) | `5b832c7d4` |
| 11-04 | Owner: 「실기만 반복하지 말고 근본 원인부터」 → **방법 변경**: ① 명세 → ② 대조·수정 설계 → ③ 한 번에 구현 → ④ 실기 1회 | `ads-root-cause-and-method-2026-11-04.md` |
| 11-04 | ① 명세(규칙 333 · 다름 46 · 확인 못 함 22 · 충돌 57) → Owner D-1~D-30 조건부 승인 | `ads-screen-behavior-spec-2026-11-04.md` |
| 11-04 | ② 수정 설계안 + 보완(레거시 7개 앱 비교 · 제3자 비공개 · 목적지 · 관리자 12기능) — **P0 2건 새로 발견**(인증 없는 주문 API · 공개 RLS) | `ads-fix-design-2026-11-04.md` · `ads-fix-design-supplement-2026-11-04.md` |
| 11-04 | ③ 「설계안대로 구현」 — 6개 영역 병렬 구현, DB 8건, 운영 롤백 시험 8개 OK | 커밋 `9af6b28c2`·`7b9912ffd`·`627fe3022` |
| 11-04 18:02 | 「DB 적용·main 반영」 — DB 8건 운영 적용, main 반영 | §5 |
| 11-04 | 팝업 노출 빈도 재확인 — 결함 F-1~F-4 발견(F-1 은 내 회귀) | 보고만 함 |
| 11-04 | Owner: 「어드민 설정↔인트로·팝업·PTR·배너 연동을 감사해서 구현, 전체 SSOT」 → 4갈래 감사 → **전체 SSOT 문서** + 3갈래 구현 | `docs/dibay-ads-surface-master-ssot.md` · `818d5e625`·`c8e0aba3c` |
| 11-04 20:04 | Owner 최종 결정 8개 · DB 1건 적용 · QA 광고 8건 종료 · main 반영 | §5·§6 |
| 11-04 20:32~23:47 | Cursor 실기 v5(22개 · 인트로 제외) | §7 |

---

## 4. 커밋 (모두 main 반영됨)

### 4-1. 11-03 (요약)

- `e85a05347` · `2674482d4` · `18dc95bf1` · `e82ae3c63`: 감사 1~4단계
- `f415cfc74`: DB 3건(O-10·O-6②·O-4)
- `6b63fe362`: Owner 결정 웹
- `5f79fef45`·`7c03edf9e`·`4ea8bbf54`·`e95062a26`: S-0~S-3
- `c6ea54022`: QA 이벤트 배너 15행 종료 백업
- R1~R4: `79b8eb3fb`·`5fa7fa92e`·`6e70d51c3`·`68853db96`·`600fad9c3`

### 4-2. 11-04

| SHA | 내용 |
|---|---|
| `8671c2f75` | 재감사 P0·P1 + Owner 결정 1~4 — 상위노출 결제 키 유지·서버 재전송 확인, 어드민 메뉴·감사, 피드 기록, 이벤트 종료, 연장 차단 등 |
| `5b832c7d4` | 커뮤니티 상위노출 표시(배경 + 「포인트 노출」 · 남은 기간 제거) |
| `9af6b28c2` | DB 8건(D-5 피드 정지·재개·종료 환급 · D-13 배달 운영 귀책 환급 · D-9 커뮤니티 만료 · D-10 글 상태 연동 · PB-39/40 · FB-M06 · FB-E07 · PV-2 공개 RLS 회수) |
| `7b9912ffd` | 광고 ② 웹 223파일 — **FB-M13**(피드 연장 두 번 차감 P0) · **PV-1**(인증 없는 주문 API 삭제) · PV-3/4/5(공개 응답에서 기간·결제 제거) · DS-1~9(목적지) · AL-01~20(관리자) · D-x |
| `627fe3022` | 인트로 시작 경로(단독 커밋) — 준비 중 예외·백그라운드는 커뮤니티로 넘김 · 손상 게시본 200 unpublished · CTA 금지 경로 |
| `818d5e625` | DB: 콘텐츠 방문 출처에 PTR·INTRO 추가 |
| `c8e0aba3c` | 광고 표면 전체 SSOT 67파일 — F-1·F-2·F-3 · P-1~P-9 · CX-01·02·03·05·06·07·08·09·12·14·16 · IN-N1·N2·N3·N6 · FA-1~6 · EV-1~4 · DL-1~3 · MY-1·2 · 전체 SSOT 문서 |

작업 브랜치 `fix/ads-design-impl-1104` · `fix/ads-surface-ssot-1104` 는 원격에 남아 있다(Vercel 배포 꺼짐). 작업하던 worktree `/Users/bkkim/projects/samarket-ads-s1` 는 **지금 없다**(정리됨). 다음 작업은 최신 origin/main 에서 새 브랜치로 시작한다.

---

## 5. 운영 DB 적용 목록 (ckdosyydvgzqwpbwuhon · 모두 적용됨)

| 마이그레이션 | 내용 | 확인 |
|---|---|---|
| `20271105100000_feed_ad_campaign_pause_resume_end_refund` | 피드 칸 `paused_by`·`paused_at`·`public_reason`·`paused_seconds_total` + `admin_feed_ad_pause/resume/end` | 롤백 시험: 2시간 정지 → +7200초, 운영 귀책 환급 6952P 1행. 적용 후 md5 일치(주석 2줄만 다름) |
| `…100100_admin_delivery_ad_end_with_refund` | 배달 운영 귀책 종료 비례 환급(비즈니스 캐시) | 롤백: 50% → 17,500 환급 1행·감사 1행 |
| `…100200_community_promotion_orders_expire` | 커뮤니티 만료 함수(cron `/api/cron/community-promotion-orders-expire` · 10분) | 롤백 OK |
| `…100300_community_promotion_sync_post` | 커뮤니티 글 숨김 → 정지, 다시 보임 → 재개 + 연장, 회원 삭제 → 종료(환급 0). 트리거 `trg_community_posts_zz_promotion_sync` | 롤백 4종 OK |
| `…100400_promotion_purchase_pending_dup_price_lock` | 거래: 심사 중 중복 결제 차단 · 커뮤니티: 결제 함수 안에서 가격 다시 읽기(`price_changed`) | 롤백 OK |
| `…100500_feed_ad_requests_drop_insert_own` | 회원이 피드 신청을 직접 INSERT 하던 정책 삭제 | 롤백 OK |
| `…100600_record_feed_ad_event_validate` | 소재 id 없음·잘못된 위치 거부 | 롤백 OK |
| `…100700_ads_public_select_policies_revoke` | 광고 표 4개 공개 SELECT 정책 삭제 · anon 권한 회수(P0) | 적용 후 공개 정책 0 · anon 권한 0 (11-04 재확인) |
| `20271105110000_content_visit_source_ptr_intro` | 방문 출처 CHECK 에 PTR·INTRO 추가 | 적용 후 시험: 저장 OK · 모르는 출처 거부 · 기존 792행 유지 |

---

## 6. 운영 데이터 조치

| 시점 | 조치 | 결과 |
|---|---|---|
| 11-03 | QA 이벤트 피드 배너 15행 종료 | 백업 커밋 `c6ea54022` |
| 11-04 | **QA 광고 8건 종료·숨김**(Owner 승인) | 팝업 `QA-ADS-1103-S7-trade-2` · PTR `S8-ptr-1`·`S8-ptr-2` → ended(감사 행). 배달 `S5b-home-top-1`·`home-mid-1`·`home-mid-2` → ENDED(귀책 none · 환급 0 · 감사 행). 마이 `S6-my-1`·`my-2` → hidden(변경 기록). 노출 기록(팝업 114건)은 보존했다. 운영 공개 API 에서 팝업·PTR 후보 0 |
| 11-04 | **손대지 않음**: 같은 이름의 검토 대기 팝업 2개(`QA-ADS-1103-S8-ptr-1·2` center_modal 판 · 노출 안 됨) · 기간이 지난 active 피드 캠페인 6개(노출은 기간으로 걸러짐) | 정리하려면 별도 승인 |
| 11-04 23:47 | v5 실기 샘플 정리(Cursor) | 진행 중 팝업·피드·상위노출 0 · QA 포인트 시작값과 같음 |

---

## 7. 실기 상태 (v5 · Production `4c6161b44` · 11-04 20:32~23:47 PHT)

- 프롬프트: `cursor-prompt-ads-device-verify-v5-2026-11-04.md`
- 보고서: `cursor-report-ads-device-verify-v5-2026-11-04.md`
- 기기: SM-M156S(q테스트1) · Xiaomi 24076RP19G(zxzx11) · iPhone 17 Pro 시뮬레이터(w테스트1)
- **Claude 대조는 일부만 했다**: V-13·V-20 은 운영 DB 로 확인했고, 나머지는 Cursor 판정을 그대로 옮긴 것이다.

| 판정 | 항목 |
|---|---|
| PASS | V-3 커뮤니티 상위노출 표시 · V-6 피드 노출·클릭 · V-9 팝업 × 하루 1회 · V-10 팝업 CTA 뒤 숨김(F-1) · V-11 외부 주소 · V-12 빈도 변경 숨김(F-2) · V-20 커뮤니티 글 관리자 삭제 환급(9,869P · 운영 DB 확인) |
| 부분 PASS | V-4 동네 탭 · V-7 격자(Xiaomi 미완) · V-14 손으로 넘기기(iOS 미완) · V-16 PTR 허용 목록(로그아웃 교차 미실시) · V-17 2:1 업로드 거부(미리보기 나란히 미완) · V-22 콜드 스타트(iOS 미완) |
| **FAIL** | **V-13 ② PTR CTA 칩을 눌러도 이동 없음.** 운영 DB 확인 결과 S-R(`933720ac…`) 기록은 impression 3 · dismiss 2 · **click 0** 이다. 원인은 확인하지 못했다(D-1 로 칩만 버튼이 된 뒤의 회귀일 수 있음 · 좌표 탭 문제일 수 있음) |
| NOT_PROVEN | V-1(P0 연장 재시도) · V-2 · V-5 · V-8 · V-15 · V-18 · V-19 · V-21 — 샘플을 만들지 못해서(S-T 거래 글 사진 피커 게시 실패 · S-F·S-D 미착수) |
| 제외 | V-23·V-24 인트로(Owner 결정) |

- **내 잘못(프롬프트)**: V-13 PASS 조건에 「방문 기록 출처 PTR」을 넣었다. 그런데 방문 기록은 **이벤트 목적지일 때만** 남는다. S-R 목적지는 `/market` 이라 방문 기록 0 이 정상이다. 다음 프롬프트에서는 PTR 목적지를 이벤트로 잡아야 한다.
- 실기 중 발견(보고만 함): 피드 일괄 삭제 안내 문구에 「노출 중인 **홍보**가 연결된 글입니다」가 남아 있다. 「홍보」를 「상위노출」로 바꿔야 한다.

---

## 8. 남은 일 (우선순위)

### 8-1. 결함 (설계안 → 승인 → 구현 → main 1회)

1. **V-13 PTR CTA 무반응 (P1)**
   - 할 일: `components/ptr/DibayPtrRevealBand.tsx`(D-1 에서 띠 전체 버튼 → CTA 칩만 버튼으로 바꿈)와 `DibayPtrRevealAdLayer.tsx` 의 onCta·pointer-events·접힘 타이밍을 실제 기기 로그로 원인 확정한다.
   - 확정한 뒤 설계안을 올린다. 추측으로 고치지 않는다.
2. **피드 일괄 삭제 안내의 「홍보」 문구** → 「상위노출」
3. 아래 「남은 위험」 중 Owner 가 고치라고 하는 것

### 8-2. 실기 (Cursor · v6 프롬프트 필요)

- 남은 것: V-1(P0) · V-2 · V-5 · V-8 · V-15 · V-18 · V-19 · V-21 + 부분 PASS 의 빠진 기기(Xiaomi V-7 · iOS V-14·V-22 · V-16 로그아웃 교차 · V-17 미리보기 나란히) + V-13 수정 뒤 재확인.
- 샘플을 만들지 못한 원인부터 푼다.
  - 거래 글 사진 피커 게시 실패: `adb push` + 미디어 스캔 후 피커, 그래도 안 되면 사진 없이 게시가 되는지 확인
  - S-F·S-D 는 미착수
- PTR 목적지는 **이벤트**로 잡는다(방문 기록 확인용).
- 로그아웃 교차(V-16)는 비밀번호 입력 금지 때문에 막혔다. 이미 로그인된 다른 기기·시뮬레이터 계정으로 바꿔서 한다.

### 8-3. Owner 결정이 필요한 것 (구현하지 않음)

| # | 내용 | 메모 |
|---|---|---|
| E-1 | 앱 안 상위노출을 은행 송금·GCash 로 충전한 포인트로 판다. Apple 3.1.3(g)·Google Play 결제 정책 위험 | 광고와 분리해 결제 정책 검토 |
| D-20 | 도메인 메뉴에 「만들기」 항목이 원래 없다(설계 전제가 틀렸음). 메뉴를 추가할지 | 지금은 만들기 화면이 `?domain=` 으로 미리 고른 채 열리는 것만 구현됨 |
| AL-13 | 사장님 유료 팝업 승인 뒤 운영 종료 환불 | 판매가 꺼져 있음 — 판매를 켤 때 정한다 |
| CX-04 | 이벤트 상세에 직접 들어간 경우도 팝업 조정에 넣을지 | 지금은 넣지 않음 |
| D-30 위험 기록 | 「포인트 노출」이 광고 식별 의무를 채우는지는 근거가 없다(NOT_PROVEN) | Owner 결정으로 유지 |

### 8-4. 남은 위험 (보고만 함 · 고칠지 Owner 판단)

- **D-10**: 관리자 글 삭제 때 상위노출 주문을 먼저 끝낸다. 그 뒤 글 변경이 실패하면 주문만 끝난 상태로 남는다. 모임 숨김은 상위노출을 확인하지 않는다.
- **배달**:
  - 매장 없는 배너는 클릭이 기록되지 않는다(`delivery_ad_click_events.store_id` NOT NULL).
  - 「강제 종료」·예약 종료는 환급 없이 끝난다(D-13 과 다른 경로).
  - 관리자 삭제가 한 트랜잭션이 아니다.
- **팝업 일괄 삭제**: 원자 처리가 아니다(1건씩 처리하고 실패 목록을 돌려준다).
- **알림 설정 DB 시드 행**: 이름에 「홍보」가 남아 있다(코드 쪽 이름만 「상위노출」로 바꿈).
- **PB-9·PB-10**(거래 카테고리 지역 조건): 코드만 맞췄고 화면 효과는 NOT_PROVEN.
  - `PostListByCategory` 는 시드를 쓰지 않는다.
  - `CategoryListLayout` 이 지역 값을 넘기지 않는다.
- **공용 함수 `isCommunityPostPubliclyVisible`**: status=active 이면 is_deleted=true 여도 공개로 본다(범위 밖 결함).
- **`admin_ads_history_page`**: 검색 칸 문구가 옛 영어라 「사장님」으로 검색하면 안 나온다.
- **인트로**: 성과 기록이 없다(Owner 결정 ⑤ — 이번 범위 아님). 기간·하루 1회를 기기 시계로 판정한다(설계상 위험 · 어드민 안내 있음).
- **이벤트 히어로**: 노출·클릭 기록이 없고 표기가 「dibaY」 이다(Owner 결정 ①⑤로 유지).

---

## 9. 문서 지도

| 종류 | 파일 (`docs/`) |
|---|---|
| **전체 정본** | `dibay-ads-surface-master-ssot.md` (영역 사이 공통 계약 · Owner 결정 대기 §8) |
| 영역 정본 | `DIBAY_APP_LIFECYCLE_SSOT.md` §7.2 (인트로) · `dibay-promotion-program-ssot-lock.md` (팝업 빈도·닫기) · `dibay-global-popup-ad-product-contract-lock.md` · `dibay-ptr-reveal-final-ssot.md` · `dibay-paid-exposure-feed-ad-master-contract.md` · `dibay-feed-banner-product-hard-lock.md` · `dibay-delivery-advertising-ssot.md` · `dibay-promotion-advertisement-product-contract.md` |
| 감사·설계 (`audit/`) | `ads-full-audit-2026-11-03.md` → `ads-owner-decisions-2026-11-03.md` → `ads-full-reaudit-2026-11-04.md` → `ads-root-cause-and-method-2026-11-04.md` → `ads-screen-behavior-spec-2026-11-04.md`(명세 · D-1~D-30) → `ads-fix-design-2026-11-04.md` → `ads-fix-design-supplement-2026-11-04.md` · `community-boost-display-redesign-2026-11-04.md` |
| 실기 (`audit/`) | 프롬프트 v2·v3·v4(실행 안 함)·**v5** · 보고서 `cursor-report-ads-device-verify-2026-11-04.md`(v3) · **`cursor-report-ads-device-verify-v5-2026-11-04.md`** |
| 이 문서 | `audit/ads-handoff-2026-11-05.md` |

`docs/audit/*.md` 대부분은 메인 저장소에 **추적되지 않는 파일**(untracked)이다. 커밋된 것은 정본 문서와 코드다.

---

## 10. 작업 환경 메모

- 운영 Supabase: `ckdosyydvgzqwpbwuhon`
- Vercel: project `prj_F75kGK83Sd7B4An6IURjQUc0VW5D` · team `team_pvmVIRp0rvayJ1LN07RLLlft`
- **푸시**: SSH 키가 거부된다.
  - `git -c credential.helper='!gh auth git-credential' push https://github.com/kimbk01/samarket.git HEAD:main`
  - 샌드박스 밖에서 실행해야 한다.
- **로컬 검사 1회**:
  - `NODE_OPTIONS=--max-old-space-size=10240 npm run -s typecheck:build`
  - `NODE_OPTIONS=--max-old-space-size=10240 npm run -s typecheck:test`
  - 관련 vitest · 변경 파일 eslint
  - `verify:routes` · `verify:trade-hot-path-contract` · `verify:admin-real-operation-cut-{a,c,e,f,g,j}-…-hard-lock` · `verify:design-system-hard-lock`
  - 커밋은 `--no-verify`
- **기존 실패**(기준 main 에서도 실패):
  - Node localStorage 7파일·32개
  - `verify:single-community-surface-authority`
  - `verify:delivery-product-hard-lock` 은 rg 실행 실패(환경 문제)
- **운영 롤백 시험 패턴**: `DO $$ … RAISE EXCEPTION 'ROLLBACK_OK …' $$`.
  - `auth.role()` 을 보는 함수는 `set_config('request.jwt.claims','{"role":"service_role"}',true)` 를 먼저 건다.
  - plpgsql 의 `IF … CASE WHEN … THEN` 은 괄호로 감싸야 한다.
- **계정**: 회원 q테스트1·w테스트1·zxzx11 · 관리자 메인관리자(`11111111-1111-1111-1111-111111111111`).
- 문구 카탈로그: 이번 작업 문구는 `lib/i18n/catalog/ads-impl-1104-{p,f,u,a,i}.ts` 에 있다(뒤에 spread 되어 덮어씀).
