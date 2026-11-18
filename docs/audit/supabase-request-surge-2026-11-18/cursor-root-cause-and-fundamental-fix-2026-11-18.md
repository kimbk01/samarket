# Supabase 요청 급증 — 원인 확정 · 근본 수정 설계 (2026-11-18 · Cursor 검증)

- Owner 지시: 「정확한 원인을 확인 하고 근본 적인 수정안을 보고」 · 「임시 땜빵 금지」 · 「기능과 속도는 문제 없도록」 · 「레거시와 비교」 · 「지금은 테스트인데 회원이 늘면 무조건 터진다」 · 「어제부터 터진다」
- 상태: **설계 승인됨 (Owner 2026-11-18).** Phase A1 구현 = 이 PR. B·C는 후속 단독 PR.
- 기준 코드: `origin/main` (S-1 수신 쿼리 축소는 #466 으로 **되돌린 상태** — A1은 그 대안 「묶기」)
- 시간: PHT. 증거 표기 CODE / PROD / NOT_PROVEN / BLOCKED
- A1 동등성: `a1-incoming-reconcile-throttle-equality.md`

---

## 0. 한 줄 결론

| 구분 | 판정 |
|---|---|
| **어제~오늘 숫자가 커진 직접 유발** | 시험·실기기 반복 실행(콜드 스타트·화면 이동)이 **이미 있는 구조 비용**을 크게 드러냄 (PROD 분해 근거는 기존 11-18 edge/Vercel 측정; 본 세션에서 edge 로그 재집계는 Management API 부재로 NOT_PROVEN) |
| **회원이 늘면 반드시 터지는 근본** | (1) API·화면 1회 = Supabase 여러 번 (2) 상시 cron 24개 (3) V4 웹·맥 수신이 Realtime 정상인데도 HTTP 폴링 유지 + 수신 1회당 `call_sessions` 5회 (4) proxy 회원 상태 인스턴스 메모리 5초 |
| **「PC에서 맥」만의 문제인가** | **아님.** 맥(`iosAppOnMac`)은 구조 부하의 **한 경로**. 전체·어제 급증의 단일 원인이 아님 |
| **임시 땜빵이 아닌 근본** | 요청당 DB 왕복을 줄이고(속도↑), 정리(reconcile)는 폴링과 분리·묶기(동등성 유지), cron 통합, 레거시와 같은 「Realtime 정상 시 백업 HTTP 0」은 **Owner S4 재승인** 후에만 |

---

## 1. 대시보드가 말하는 것 (Owner 캡처 · PROD)

| 창 | 합계 | 핵심 |
|---|---|---|
| 24h | ~266,754 · 성공 ~100% | **API Gateway ~261k** 가 대부분. DB CPU·연결 여유 → **장애(다운)가 아니라 과다 호출** |
| 60m | ~9,689 · API Gateway ~9,493 | 시간당 ~9.5k → 하루 환산 ~23만대와 맞음 → **지금도 연속 호출** |

60분 화면의 PostgREST 소수 vs API Gateway 다수는 지표 정의 불일치 가능 → 「PostgREST가 거의 없다」로 단정하지 않음 (**NOT_PROVEN**).

본 세션 14:55~14:59 PHT 서버 계수기(`cm_monitoring_rollup_hourly` · `server.supabase_*`, 설치 직후라 **전체 Kong 합계보다 작음**):

- cron  alone ~289 SB / ~172 HTTP (이번 시각)
- 어드민 inbox·bell 연속
- `/incoming`·`poll_tick` 이번 시각 0 (맥/웹 폴링이 꺼졌거나 계수기 미포착) — **코드 구조는 그대로**

---

## 2. 왜 「어제부터」인가

구조는 어제 갑자기 생긴 것이 아니다.

| 시점 | 사실 | 판정 |
|---|---|---|
| 11-08 | S4: Realtime SUBSCRIBED 5초+ 이면 HTTP **2초→10초** (폴링 0 불승인) | CODE `CALL_V4_INCOMING_POLL_REALTIME_HEALTHY_MS` · `77c4ec2ee` |
| 11-15 | 맥 수신 D2-3: `CallV4MacIncomingHost` + `macIosApp: true` (PushKit 없어 웹 탐색이 유일한 벨) | CODE `c4f8ea641` |
| 11-17~18 | Android 빌드 77→79 진입/푸시 수정 + 인트로·하단내비 실기기 반복 → 콜드 스타트·API 폭증 | PROD 기기·작업 세션(기존 11-18 분해) / 본 세션 재집계 NOT_PROVEN |
| 11-18 | S-1(#464) 병합 후 **동등성 BLOCKED 로 #466 되돌림** → 운영은 여전히 수신 1회당 다중 쿼리 | CODE `origin/main` |

→ **어제 「터진」 체감 = 시험량이 구조 비용을 임계 이상으로 밀어 올린 것.**  
시험만 줄이면 숫자는 내려가지만, **회원 증가 시 같은 구조로 재발**한다.

---

## 3. 레거시 vs 현재 (구조 결함)

| 축 | 레거시 `GlobalCommunityMessengerIncomingCall` | 현재 V4 (`call-v4-incoming-discovery` · 운영 마운트) |
|---|---|---|
| 운영 마운트 | V4 lane에서 **미마운트** (`CallIncomingChrome`) | 데스크톱 웹 + **맥 iOS 앱** |
| Realtime 정상 · 비울림 · 포그라운드 | **백업 HTTP 0** (`shouldRunIncomingCallBackupHttpRequest` → `realtimeOk` 이면 false) | **10초마다 HTTP** (S4) |
| 숨김 · 비울림 | **HTTP 0** (포그라운드 게이트) | 메신저 표면이면 **10초 유지** (S4: 보임=숨김) |
| Realtime 비정상 | ~2.5초 | 2초 |
| Android/iPhone 폰 | (미마운트) | discovery **없음**(네이티브) — 개선 |
| 서버 `/incoming?directOnly=1` | 동일 API | `origin/main`: reconcile + **live 조회** + **stale 정리 재호출** + 목록 = **`call_sessions` 5회** (+ auth/profiles) |

**레거시가 더 싸던 핵심:** Realtime이 건강하면 백업 GET을 끈다.  
**현재가 비싼 핵심:** S4 계약으로 10초 HTTP를 유지하고, 그 매 호출이 서버에서 5쿼리로 증폭된다.

Presence HTTP는 레거시/V4 공통 `HEARTBEAT_MS = 12_000` (켠 탭 기준) — 수신 경로와 별개.

---

## 4. 근본 원인 (규모 위험 순)

### R1. 요청 1회 = Supabase N회 (회원·화면 수에 비례)

대표 (CODE · `origin/main`):

| 경로 | 대략 1회당 | 비고 |
|---|---|---|
| `GET …/calls/sessions/incoming?directOnly=1` | `call_sessions` **5** (+ profiles 등) | 목록 응답에 불필요한 live·중복 stale 포함. **단순 2건 삭제는 11-08 §6 BLOCKED** |
| `stores/home-feed` 캐시 미스 | ~16+ (wave RPC 다수) | 홈/배달 |
| `me/notifications/room-read` | ~19 | 방 읽음 |
| `badge-count` | ~5~8+ | 셸 |
| `rooms/…/messages` · bootstrap | ~4~11 | 방 진입 |

→ 사용량↑ = 선형 이상으로 증가. **속도에도 해로움**(왕복 직렬·병렬 과다).

### R2. 상시 cron 24개 (사용자 0이어도 계속)

`vercel.json`: 1분×3 · 2분×2 · 5분 다수 · 기타.  
14:59 PHT 실측: cron만 SB 수백/시. `delivery-ads` 1회당 ~11 SB.

### R3. V4 웹·맥 수신 폴링 × 서버 증폭

- 웹·맥: Realtime 정상에도 **10초** GET (S4)
- 맥: PushKit 없어 discovery 필수 (D2-3)
- 서버: GET마다 정리+목록 묶음 → 기기·탭 수 × 시간당 수백~수천 SB

### R4. proxy 회원 상태 5초 인스턴스 캐시

서버리스라 인스턴스마다 따로 → API 간격 >5초면 매번 `profiles` 등. 회원·요청 수에 비례.

### R5. 감지·예산이 최근까지 없음

계수기·일 1회 감시(#470/#472)는 **방금** 들어감. 24h 급증을 이 계수기만으로 재현·분해하기엔 아직 짧음.

---

## 5. 하면 안 되는 것 (땜빵 · 속도·기능 위험)

| 금지 | 이유 |
|---|---|
| 수신 폴링만 늘려 부하 줄이기 (예: 60초) | 벨·원격 종료 백업 지연 → **기능·체감 속도 실패**. S4·통화 규정 |
| Owner 재승인 없이 「Realtime이면 HTTP 0」 | 11-08 Owner: SUBSCRIBED만으로 폴링 0 **불승인**. 숨김 무음 사망 위험 |
| S-1처럼 reconcile에서 쿼리만 빼기 | 11-08 보완서 §6 **BLOCKED** (missed 시점·재시도 동등성) |
| prefetch·부트 API 제거만 하고 대체 없음 | 첫 화면 **느려짐** (속도 조건 위반) |
| 캐시 TTL만 늘려 차단 반영 늦추기 | Auth/보안 계약 위반 |

---

## 6. 근본 수정안 (기능·속도 유지)

원칙: **같은 화면·같은 계약 응답을 더 적은 DB 왕복으로** → 체감 속도는 같거나 빨라짐.

### Phase A — 수신 경로 (통화 단독 · 최우선 구조)

**A1. `/incoming` = 가벼운 LIST + 묶인 RECONCILE (S-1 대체 · 동등성 유지)**

11-08 BLOCKED 대안을 구체화:

1. **LIST (매 폴링):** `recipient=me · ringing · direct · limit 10` **1회만**. 정리 쓰기 없음.  
   → 응답 지연↓ (**속도 개선**).
2. **RECONCILE (사용자당 N초에 최대 1회):** 지금 reconcile이 하는 stale ringing/active 정리를 **그대로** 수행.  
   - N 초깃값 제안: **30초**(울림 타임아웃과 맞춤) 또는 cron 2분과 맞춤 **60초**.  
   - 저장: 서버 메모리(단일 인스턴스)만으로는 부족 → **DB 한 줄 또는 기존 표의 `reconciled_at`/`advisory`** 로 사용자 단위 게이트 (운영 Redis 없음).  
   - 폴링이 N보다 짧아도 정리는 N에 1회, 목록은 매번 1쿼리.
3. **cron `stale-cleanup`(2분)** 유지 → 폴링 없는 기기의 만료도 처리 (지금과 동일 안전망).
4. **동등성:** 정리 **결과**(missed/end)는 동일, **시점만 ≤N초 지연**. 11-08 표의 「재시도·사이 만료」는 「다음 묶인 reconcile 또는 cron」으로 수렴 → 별도 동등성 표 10항을 다시 작성해 Owner 승인.
5. **절차:** 통화 변경 규정 — 영향 분석·실기 행렬 V-1~V-8 · 맥 수신(V-8) 포함. 단독 PR.

예상(산술): 맥/웹 탭 1개·10초 폴링·하루 켠 시간 T시간  
- 지금: ~360×5 = **1,800 `call_sessions`/시간**  
- A1 후: ~360×1 + (3600/N) reconcile≈2~3 ≈ **~400/시간** (N=30)  
→ 기능(벨)은 Realtime+10초 백업 유지, **HTTP당 서버 일 감소로 응답 빨라짐**.

**A2. (Owner 재승인 시에만) 레거시 정렬 — Realtime healthy 시 HTTP 0**

- 레거시와 동일: `realtimeOk && !ringing && foreground → HTTP off`.  
- 끊김·visibility·online 시 즉시 1회 + 2초.  
- S4 「폴링 0 불승인」과 충돌 → **명시적 Owner 재승인** 없으면 구현 금지.  
- A1만으로도 회원 규모에서 수신 부하는 크게 줄어듦.

**A3. 맥**

- discovery 유지(대안 Push 채널 없으면 불가).  
- 부하는 **A1으로 서버 단가 절감**이 근본. 앱 종료/백그라운드 정책은 제품 결정(별도).

### Phase B — 요청당 왕복 축소 (비통화 · 속도↑)

도메인별 단독 PR. 전후 「1회당 SB 수」 측정.

| 순위 | 대상 | 수정 | 속도 |
|---|---|---|---|
| B1 | `stores/home-feed` | 요청 단위 설정 1회 · wave RPC 1~2회로 합치기 | ↑ |
| B2 | `room-read` · 방 메타 · `badge-count` | 읽음+알림정리+배지 **RPC 1회** | ↑ |
| B3 | `rooms/…/messages` · bootstrap | 접근 확인 결과 재사용 · snapshot 중복 제거 | ↑ |
| B4 | proxy 회원 상태 | 세대(epoch) 공유 또는 요청 단위 재사용 — **TTL만 연장 금지** | ↑/동일 |

### Phase C — cron 구조

| 항목 | 내용 |
|---|---|
| C1 | 1분 작업 3종(접수 알림·푸시 인계·accept timeout) → **할 일 있을 때만** 도는 DB 함수 1회 또는 단일 cron |
| C2 | `delivery-ads` 등 1회당 10+ 조회 → 함수 1회 |
| C3 | 효과 없는 no-op 실행도 Kong/함수 비용 → early exit |

사용자 0이어도 도는 바닥 부하를 낮춤. **앱 기능 경로 속도무관·개선**.

### Phase D — 운영·재발 방지 (이미 일부 반영)

- 시험 실행 10회 상한 · 요청 예산 계수기·일 1회 경보 (`docs/request-budget-ssot.md`) — **유지·보강**.  
- 시험 트래픽과 실사용 분리 집계.

---

## 7. 구현 순서 (승인 단위)

| 단계 | 내용 | 통화 규정 | 속도 |
|---|---|---|---|
| **0** | 이 설계 승인 | — | — |
| **1** | Phase A1 (LIST+묶인 RECONCILE) + 동등성 표 + 실기 행렬 | **예** | LIST 빨라짐 |
| **2** | Phase B1~B3 (핫패스 RPC/재사용) | 아니오(해당 도메인) | ↑ |
| **3** | Phase C cron 통합 | 아니오(stale-cleanup 만 통화 주의) | 바닥 부하↓ |
| **4** | Phase B4 Auth | Auth HARD LOCK | ↑ |
| **5** | Phase A2 (선택 · Owner S4 재승인) | **예** | 폴링 횟수↓ |

각 단계 완료 = 코드 PASS + (통화면) 실기 PASS + 계수기/대시보드로 **1회당 SB·시간당 총량** 전후 기록. 추정만으로 완료 금지.

---

## 8. 예상 효과 (산술 · 실측 전 NOT_PROVEN)

같은 시험량·같은 켠 기기 가정:

| 단계 | 방향 |
|---|---|
| A1 | 수신 관련 SB 큰 폭 감소(폴링 유지해도 1회당 5→~1+α) |
| B | 홈·방·뱃지 진입 왕복↓ → **화면 체감 속도 개선** |
| C | 무사용 시간대 바닥(지금 cron 수백/시) 감소 |
| A2 | 추가 감소(승인 시) |

회원 N배 → 지금은 대략 N×(폴링+화면×배수+cron).  
A+B+C 후에는 N×(훨씬 작은 단가).

---

## 9. NOT_PROVEN · 한계

- 본 세션에서 Supabase edge 로그 24h 표별 재집계 (Management 토큰 없음).
- 「시험 기기 증가분 89%」는 기존 11-18 Vercel 분해값 — 여기서 재계산하지 않음.
- 14:59 기준 `/incoming` 계수기 0이 맥 종료인지 누락인지는 NOT_PROVEN.
- A1의 N초·DB 게이트 구현 세부(표 vs advisory)는 승인 후 상세 설계 1페이지.

---

## 10. Owner 결정 필요

1. **Phase A1** 승인 (통화 단독, 동등성 표 포함) — 권장 1순위.  
2. Phase B·C 진행 여부·순서.  
3. Phase A2(레거시형 HTTP 0) S4 재승인 여부.  
4. 구현 지시 시 이 문서 범위만 진행 (범위 밖 통화/Auth 금지).
