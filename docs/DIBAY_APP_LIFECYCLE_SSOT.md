# DIBAY APP LIFECYCLE SSOT

| Field | Value |
|---|---|
| **Document status** | **POLICY_APPROVED · IMPLEMENTED · ANDROID CORE OBSERVED PASS · OVERALL PARTIAL** |
| **Date** | 2026-10-12 |
| **Owner policy** | **A — APPROVED** (OS_RESTORE with valid restore → no Intro; restore previous screen) |
| **Implementation** | Android core Lifecycle 실측 PASS · iOS/회귀 다수 NOT_PROVEN · **Production Deploy 보류** |
| **Reference apps** | KakaoTalk · Baemin · Karrot (user-visible behavior). Internal impl NOT copied |

| Grade | Meaning |
|---|---|
| **OBSERVED** | 실기기 관찰 |
| **PLATFORM_CONFIRMED** | Android / Apple 공식 문서 |
| **CODE** | DIBAY 코드 확인 |
| **NOT_PROVEN** | 미검증 |

---

## 1. 레거시 정의

- **레퍼런스** = 카카오톡·배민·당근 등 상용 앱의 **사용자 관점** Lifecycle.
- 별도 DIBAY 소스/브랜치 탐색은 **오탐**이었으며 중단됨 (`LEGACY_ANALYSIS_BLOCKED` 원인 = 대상 오류).
- 카카오톡 OS process death 후 이전 화면 복원·스플래시 0 = **UX 기준 OBSERVED**. 내부 구현 복제 금지.

---

## 2. Owner 정책 A — APPROVED

**OS 프로세스가 종료되더라도 유효한 복원 상태가 있으면 Intro를 표시하지 않고 기존 화면으로 복귀한다.**

| 실행 상태 | Intro | 진입 화면 |
|---|---|---|
| **USER_COLD** | ON ∧ 로컬 Intro index 준비 시 표시 (`no_index`면 §7.1) | Intro 후 Initial Surface (또는 index 없으면 Surface) |
| **WARM_RESUME** | 안 함 | 기존 화면 유지 |
| **OS_RESTORE** (유효 복원) | 안 함 | 이전 화면 복원 |
| **OS_RESTORE** (복원 실패) | **안 함** | **Safe Entry** (아래 §6) |
| **DOC_RESET** (유효 기존/복원 상태) | 안 함 | 복원 가능 화면 |
| **USER_COLD + Intro OFF** | 안 함 | Initial Surface |

규칙:

- 복원 여부 불명·상태 손상 → **복원 성공(OS_RESTORE)으로 간주하지 않음**.
- 신규 process / `LAUNCH_EPOCH` / 잔존 Envelope **단독으로** OS_RESTORE·USER_COLD를 확정하지 않음 (§4.3).
- 복원 실패·AMBIGUOUS → Safe Entry · Intro 안 함 (Intro 반복 금지).
- **확실한 USER_COLD**(`nativeRestoreHint == FRESH`만)에서만 Intro ON 정책 적용. `UNKNOWN`은 항상 AMBIGUOUS.

---

## 3. 최종 목표 동작 계약

```text
ICON / TASK resume
  → classify AppEntryKind (Native hints + Web restore envelope)
  → if launch-intent (Push/Deep Link/Call): intent wins · Intro abort
  → else match table §2
```

| 금지 | |
|---|---|
| `visibilitychange` / Cap `resume` 만으로 USER_COLD | |
| `LAUNCH_EPOCH` 신규만으로 Intro 강제 | |
| 복원 실패를 Intro ON cold로 승격 | |
| 타 계정·만료 세션 화면 노출 | |
| Intro CMS / 채팅 / 주문 / 결제 / 통화 / DB 스키마 변경 (본 Lifecycle 구현 범위 밖) | |

---

## 4. AppEntryKind 판정

### 4.1 정의

| Kind | 의미 |
|---|---|
| `USER_COLD` | 사용자가 앱을 끝낸 뒤의 **신규 task/process** (force-stop, task 제거, 재설치 등) |
| `WARM_RESUME` | process + JS document 생존 |
| `OS_RESTORE` | process는 죽었으나 OS/앱이 **복원을 시도**할 수 있는 진입 |
| `DOC_RESET` | process 생존 · Web document만 재기동 |

### 4.2 판정 입력 (어느 하나만으로 확정 금지)

| 신호 | 출처 | 역할 |
|---|---|---|
| `processEpoch` | Native UUID (`LAUNCH_EPOCH` / `launchEpoch`) | **보조만** — “이 document가 속한 process 식별”. **신규 process ≠ OS_RESTORE 증거** |
| `nativeRestoreHint` | Android / iOS (§5) | `RESTORE` \| `FRESH` \| `UNKNOWN` — OS/Task/Activity 복원 축 |
| `RestoreEnvelope` | Web(또는 Native prefs) durable store | 경로·계정·유효성. **단독으로 OS_RESTORE 확정 금지** |
| `launchIntent` | Push / Deep Link / Call pending | 최우선 목적지 |
| `shownEpoch` / Live Intro | 기존 launch-intro | **확실한 USER_COLD**에서만 Intro |

**금지 등식 (논리 정정 2026-10-12):**

- `processEpoch is new` ⇏ `OS_RESTORE`
- `RestoreEnvelope.valid`  alone ⇏ `OS_RESTORE` (force-stop 후에도 envelope가 남을 수 있음)
- `OS_RESTORE` 확정에는 **Native 복원 신호(`RESTORE`) + 유효 Envelope(+ 계정 일치)** 가 **동시에** 필요

### 4.3 결정 표 (단일 책임: Web Lifecycle gate)

판정 우선순위 (위에서 아래로, 모순 없이 첫 매칭):

```text
1) WARM_RESUME
   same processEpoch AND document still alive (not a full document reload)
   → Intro=0 · 화면 유지 · navigate 없음

2) launchIntent (Push / Deep Link / Call)
   → intent 목적지 · Intro=0

3) DOC_RESET
   same processEpoch AND document reloaded from zero
   → envelope.valid ? restore path : Safe Entry
   → Intro=0  (신규 process가 아니므로 USER_COLD/Intro 없음)

4) OS_RESTORE  (둘 다 필수)
   nativeRestoreHint == RESTORE
   AND RestoreEnvelope.valid (accountKey·만료·integrity 통과)
   → try restore path · Intro=0
   → 복원 실패 → Safe Entry · Intro=0
   NOTE: processEpoch new/old는 여기서 사용하지 않음

5) USER_COLD  (완전 신규 실행 — Intro 정책 적용)
   nativeRestoreHint == FRESH   // ONLY — UNKNOWN은 신규 증거가 아님
   → 이전 envelope는 복원에 쓰지 않고 discard
   → Intro = Live ON이면 표시 · 이후 Initial Surface
   → Intro OFF면 Initial Surface

6) AMBIGUOUS  (복원 성공·USER_COLD로 간주하지 않음)
   nativeRestoreHint == UNKNOWN   // envelope 유효 여부 무관
   OR nativeRestoreHint == RESTORE AND NOT RestoreEnvelope.valid
   OR 신호가 서로 모순
   → Safe Entry · Intro=0
   → OS_RESTORE / USER_COLD Intro 승격 금지
```

| 결과 | Intro | 화면 |
|---|---|---|
| WARM_RESUME | 0 | 유지 |
| DOC_RESET 성공/실패 | 0 | path 또는 Safe Entry |
| OS_RESTORE 성공 | 0 | 이전 화면 |
| OS_RESTORE 실패 | 0 | Safe Entry |
| USER_COLD | ON이면 1 | Intro → Initial Surface |
| AMBIGUOUS | 0 | Safe Entry |

**USER_COLD 보장:** force-stop·task 제거 등 진짜 신규 실행에서는 Native가 **`FRESH`를 반드시** 준다.  
`FRESH`가 오면 잔존 envelope와 무관하게 Intro ON 정책이 적용된다.

**UNKNOWN (명시적 주입):** 신규 실행 증거가 아니다. envelope 유효/무효와 관계없이 **AMBIGUOUS → Safe Entry · Intro=0**.  
힌트를 확보할 수 없으면 추측으로 `FRESH`/`RESTORE`를 채우지 않는다 (`UNKNOWN` 유지 · 플랫폼 한계는 NOT_PROVEN).

**레거시 Native (속성 부재):** `__DIBAY_NATIVE_RESTORE_HINT__` **프로퍼티가 아예 없으면** (구버전 Cap 앱: epoch만 주입) 명시적 `UNKNOWN`과 구분한다.  
이 경우 Web은 **USER_COLD · allowIntro=1 · Safe Entry 강제 금지** (`legacy_native_no_hint`) — Production Web 배포 시 기존 설치 앱의 Intro/Initial Surface를 보호한다.  
신규 Native는 항상 `restore|fresh|unknown` 문자열을 document-start에 주입한다.

### 4.4 RestoreEnvelope 유효성 (구체 기준)

Durable 레코드 (이름 예시: `dibay:lifecycle:restore-v1`). **스키마는 설계 계약; 구현 시 기존 storage 패턴 재사용.**

| 필드 | 요구 |
|---|---|
| `schema` | 지원 버전 |
| `path` | `/`로 시작 · `//` 금지 · 앱 내부 path |
| `accountKey` | 현재 세션 user id(또는 guest sentinel)와 **일치** |
| `writtenAt` | 만료 창 내 (권장: 세션/제품 정책과 별도 TTL — 구현 시 상수화; 만료면 invalid) |
| `taskOrSessionToken` | optional · Native가 준 복원 세대와 불일치면 invalid |
| `integrity` | 파싱 실패·필수 필드 누락 → invalid |

**invalid 조건 (복원 성공 금지):**

- path 없음 / 손상 / 만료  
- `accountKey` ≠ 현재 인증 주체 (로그아웃·계정 전환)  
- 세션 phase가 복원 불허 (만료·권한 회수 — **기존** `dibay-session-manager` / auth SSOT)  
- 대상 리소스 404·권한 거부 (게시물·채팅·주문) — 해당 path 복원 실패 → Safe Entry  
- WebView/document 부트 실패  

**유효해도 Intro 안 함.** 실패해도 Intro 안 함 (정책 A).

쓰기 시점: WARM에서 의미 있는 route 안정화 후 · background 진입 직전(가능 시).  
삭제: 명시적 logout · account switch · **USER_COLD 확정 시** 복원용으로 쓰지 않고 discard · OS_RESTORE/DOC_RESET 성공·실패 후 정책에 따라 rotate.

---

## 5. Android / iOS 설계

### 5.1 Android — PLATFORM + CODE

| 신호 | 활용 |
|---|---|
| `onCreate(savedInstanceState != null)` | `RESTORE` (Activity OS restore · envelope와 **함께**만 OS_RESTORE) |
| `session_paused` (onStop, warm onStart에서 clear) + ExitInfo | **조합만** RESTORE: paused ∧ (SIGNALED\|LMK\|…) → OS kill 복원 후보. paused ∧ OTHER/EXIT_SELF/USER_* → **FRESH** (force-stop 등) |
| paused 없음 · sis null | `FRESH` → USER_COLD (설치/clear/정상 신규 실행) |
| `ApplicationExitInfo` **단독** | **금지** (이전 process 종료 사유 ≠ 현재 실행 유형) |
| `LAUNCH_EPOCH` | process 식별 **보조** · OS_RESTORE 근거 아님 |

전달: `__DIBAY_NATIVE_RESTORE_HINT__` = `restore` \| `fresh` \| `unknown`  
(+ `__DIBAY_LAUNCH_EPOCH__`).

`ensureInitialRemotePathOnce`: Intro/Restore 판정 **이후**에만 surface navigate (D1 해소 설계).

### 5.2 iOS — PLATFORM + CODE

| 현황 CODE | SceneDelegate 없음 · AppDelegate + `DibayRootBridgeViewController` |
|---|---|
| 복원 힌트 | launch options / state restoration 등으로 `RESTORE`·`FRESH`를 **실제로 구분할 수 있을 때만** 설정. 불가하면 `UNKNOWN` |
| `was_in_background` UserDefaults | **단독으로 `RESTORE` 금지** (백그라운드 후 강제 종료·재실행과 OS 복원을 구분하지 못함). 관측 시 `UNKNOWN`. 마크 없음 → `FRESH` 후보 |
| Process purge → 새 `launchEpoch` | process 식별 보조일 뿐 · **OS_RESTORE로 해석 금지** |
| Scene 도입 | 본 설계에서 필수 아님 |
| LaunchScreen continuation | OS splash only · Intro product 아님 |

iOS에서 `RESTORE`를 안정적으로 내는 구체 API·실기기 검증: **NOT_PROVEN** (추측 채움 금지 · background 플래그로 대체 금지).

### 5.3 Native ↔ Web 계약

| Native → Web | `processEpoch`, `nativeRestoreHint` |
|---|---|
| Web → 판정 | AppEntryKind + Intro 여부 (**단일 결정 지점**) |
| Web → Native | 기존 `dismissSplash` / homePresentationReady |
| Web durable | RestoreEnvelope read/write/clear |

---

## 6. 복원 실패 · Safe Entry

신규 화면/라우트를 **만들지 않는다.** 기존 SSOT 사용:

| 우선 | 경로 권위 CODE |
|---|---|
| 1 | Launch intent path (Push/Deep Link/Call) — 있으면 그것 |
| 2 | `resolveInitialAppSurfacePath({ adminInitialSurface })` → community 기본 **`/philife`** (`lib/startup/initial-app-surface.ts`) |
| 3 | 인증이 로그인 UI를 요구하면 **기존** auth/login·온보딩 라우트 (auth SSOT) — Lifecycle이 새 로그인 화면을 추가하지 않음 |

원칙:

1. 무한 로딩·흰 화면 금지 (기존 splash dismiss / shell ready 계약 유지).  
2. 이전 계정 UI 노출 금지 (`accountKey` 불일치 시 envelope discard).  
3. auth/권한 우회 금지.  
4. Safe Entry = Initial Surface 경로 (보통 `/philife`).  
5. **Intro 반복 금지.**  
6. 채팅·주문 draft 등 domain stash는 Lifecycle이 **삭제하지 않음** (각 domain 정책).

---

## 7. Intro · Initial Surface 순서

```text
1) Launch intent
2) AppEntryKind
3) USER_COLD ∧ Intro Live ON ∧ eligible → Intro (단일 Web 결정)
4) else if restore path → restore
5) else Safe Entry / Initial Surface
```

Admin Intro ON/OFF = 기존 Live `active|paused|unpublished` + cache — **CMS 변경 없음**.

### 7.1 `no_index` — 정상 Intro 콘텐츠 미준비 (Lifecycle 결함 아님)

| 계약 | 내용 |
|---|---|
| 판정 시점 | `startup-destination.ts`가 **이미 promote된** 로컬 Intro index를 **동기·1회**만 읽음 |
| index 없음 | `reason=no_index` → Intro 스킵 · Community/Initial Surface |
| Discovery | `discovery.ts`는 **startup 이후**(OS release / foreground)만 실행 · **현재 실행 snapshot 변경 금지** |
| 최초 설치 · `pm clear` | 해당 USER_COLD에서는 Intro 없음이 **정상**. promote 후 **다음 USER_COLD**부터 Intro ON 적용 |
| Admin Intro ON | 로컬 콘텐츠가 준비된 상태에서만 표시. 최초 실행 무조건 Intro를 의미하지 않음 |

금지: `no_index`를 Lifecycle/USER_COLD 오류로 취급 · startup discovery 강제 · 비동기 대기 Intro · FRESH 억지 매핑.

---

## 8. Push / Deep Link / 통화 우선순위

1. **Call / Push pending / Deep Link intent**  
2. OS_RESTORE / DOC_RESET path (intent 없을 때)  
3. USER_COLD Intro  
4. Initial Surface  

의도 목적지가 있으면 Intro·restore path보다 **intent 우선** (현행 `hasLaunchIntent` abort 정합).

---

## 9. GAP · D1–D3 · NOT_PROVEN (등급 유지)

| ID | 상태 |
|---|---|
| **GAP-OS-RESTORE** | Android 검증 시나리오 **OBSERVED PASS** (모든 OS 종료 유형까지 확대 증명 아님) |
| D1 Initial Surface vs Intro `/` | Native IS defer + Web USER_COLD IS · **해소 방향 적용** |
| D2 이중 Cold | AppEntryKind 단일 판정 · **적용** |
| DOC_RESET 실기기 | **NOT_PROVEN** |
| 배민·당근·iOS·알림탭·세션만료·장시간 BG | **NOT_PROVEN** |

미검증을 확정 결함으로 올리지 않음.

---

## 10. Native / Web 책임 경계

| Native | Web |
|---|---|
| Splash / LaunchScreen | Intro product · RestoreEnvelope · AppEntryKind 최종 |
| epoch + restore hint | Intro 단일 결정 · Initial Surface after Intro |
| Push/Call pending store | Intent abort · router restore |
| 채팅/주문/통화 비즈니스 | **변경 금지** |

---

## 11. 구현 대상 파일 (승인 후 · 미착수)

| 영역 | 후보 경로 |
|---|---|
| Android hint | `android/.../MainActivity.java` (`onCreate` savedState, epoch plugin, `ensureInitialRemotePathOnce` 순서) |
| iOS hint | `ios/.../DibayRootBridgeViewController.swift`, `AppDelegate.swift` |
| Gate | `lib/launch-intro/startup-destination.ts`, `launch-epoch.ts`, (신규) `lib/lifecycle/*` restore envelope |
| UI root | `components/launch-intro/LaunchIntroRoot.tsx` |
| Surface | `components/app/InitialSurfaceBootstrap.tsx`, `lib/startup/initial-app-surface.ts` |
| Tests | `lib/launch-intro/__tests__/*`, lifecycle contract tests |
| Cap config | 변경 최소화 · Splash product화 금지 |

**비대상:** Intro Admin CMS UI/콘텐츠, chat/order/payment/call domain, DB schema.

---

## 12. 회귀 위험 · 검증 시나리오

| 위험 | 완화 |
|---|---|
| Intro가 OS kill마다 반복 | 정책 A + envelope/hint |
| 복원 실패 시 Intro 스팸 | Safe Entry · Intro=0 |
| 타 계정 화면 | accountKey |
| D1 surface가 Intro 선점 | surface after Intro |
| Call/Push 지연 | intent 최우선 |

검증 (구현 승인 후) — 판정 계약 회귀:

1. Force-stop + 잔존 envelope → hint=`FRESH` → **USER_COLD** · Intro ON 적용 · OS_RESTORE **아님**  
2. Force-stop · envelope 없음 → USER_COLD · Intro ON/OFF  
3–5. Home / 타앱 / 최근앱 → WARM · Intro=0  
6. `am kill` + hint=`RESTORE` + valid envelope → OS_RESTORE · Intro=0 · 이전 path  
7. `am kill` + hint=`RESTORE` + invalid envelope → Safe Entry · Intro=0  
8. hint=`UNKNOWN` (+/− envelope) → **AMBIGUOUS** · Safe Entry · Intro=0 · USER_COLD/OS_RESTORE 오판 금지  
9. DOC_RESET (same epoch, document reload) + valid envelope → restore · Intro=0  
10. Push/Deep Link · Logout/계정 전환 · `initial_surface=trade`+Intro ON  
11. 채팅·주문 숨김·복귀 · WebView 오류  
12. iOS hint 구분 · 배민/당근 — 미확보 시 **NOT_PROVEN** 유지  
13. 장시간 BG — NOT_PROVEN until run  

---

## 13. 상용 관찰 요약 (유지)

카카오 OBSERVED·배민/당근 NOT_PROVEN·OS PLATFORM 계약은 이전 감사와 동일. 상세 표는 감사 이력으로 본 문서 § 레퍼런스 정의·정책 A의 근거로만 사용.

---

## 14. 확정 체크리스트 · 종료 상태

| 항목 | 상태 |
|---|---|
| Owner 정책 A | **APPROVED** |
| 설계 SSOT | **LOCKED** (본 문서 · `no_index` §7.1 포함) |
| Android Native KEEP | **KEEP** (hint 주입 · session_paused+sis · IS Web 소유 · ExitInfo 단독 금지) |
| iOS Native KEEP | **KEEP** (background→unknown · hint 주입 · Call onAppBackground) |
| Android USER_COLD · Intro ON(index 준비) · IS · Warm · OS Restore · Safe Entry | **OBSERVED PASS** (Samsung/Xiaomi · 검증된 시나리오) |
| Intro OFF · DOC_RESET 실기기 · 통화/메신저/Push/계정 · iOS | **NOT_PROVEN** |
| 전체 리버트 | **불필요** |
| Commit / Push / Merge / Production Deploy | **미실행 · Owner 별도 승인 전 금지** |
| 최종 판정 | **PARTIAL** |
