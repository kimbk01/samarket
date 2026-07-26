# DIBAY Local Runtime Startup — Architecture Recovery (Option A)

**상태:** IN PROGRESS — 문서 SSOT + 구현 진행 중. **완료·PRODUCT PASS 아님.**  
**제품 결정:** Option A (Bundled Local Runtime). B/C 제외.  
**관련 Hybrid 기록:** [`docs/dibay-hybrid-local-shell-epic.md`](./dibay-hybrid-local-shell-epic.md)

---

## 0. P0 판정 (고정)

| 플랫폼 | 현재 |
|--------|------|
| Android | Local Boot HTML → fake shell → Cover → `location.replace` → Remote HTML/React |
| iOS | 검은 화면 / 로고 미표시 / Remote 진입 불확실 = **Startup P0 FAIL** |
| 공통 | Runtime ≠ Local · Remote document = 앱 본체 · Intro 중복 · 전환 교차 |

**판정 문자열 (허용):** `HYBRID REMOTE STARTUP` · `ANDROID PARTIAL` · `IOS FAIL` · `CROSS-PLATFORM PARITY FAIL` · `LOCAL RUNTIME NOT IMPLEMENTED`

**금지:** Local First PASS · Startup Complete · Legacy-level Complete · Cross-platform PASS · PRODUCT PASS (증거 전)

---

## 1. 목표 구조 (Option A)

```text
Native Host
  → Bundled Local Runtime          ← WebView 세션 소유 (교체 없음)
    → Local AppShell               ← Header / BottomNav / Navigation / Theme / Lang
      → Remote Data / Config / API / Sync
        → Interactive
```

### 구현 원칙

1. Capacitor WebView는 **설치 번들 Local HTML/JS/CSS**를 앱 본체로 로드한다.
2. Local Runtime이 WebView 세션을 소유한다.
3. **main-frame을 Remote Next document로 교체하지 않는다.**
4. 최종 Startup 경로에서 **`location.replace(remoteOrigin)` 제거**.
5. **`server.url` Remote document 부팅을 폐기**하는 방향으로 전환한다.
6. Remote는 API / 데이터 / 설정 / 동기화만.
7. AppShell · BottomNav · Navigation · Theme · Language는 Local Runtime에 포함.
8. Remote React를 두 번째 앱처럼 다시 띄우지 않는다.

### 제외

| 옵션 | 이유 |
|------|------|
| B Native shell + WebView data view | UI 전면 네이티브 재작성 — 범위 과대 |
| C Persistent shell + iframe hydrate | 이중 Runtime / 포커스 / 라우팅 / 쿠키 — 문제 반복 |

---

## 2. 현재 실제 Boot chain (감사 스냅샷)

```text
Native → WebView → Local Boot HTML (silhouette)
  → (Cover mitigation) → location.replace → Remote HTML → Remote React → Shell → Home
```

| Local | Remote |
|-------|--------|
| Native splash/cover, boot HTML silhouette, startup cache keys | Next document, `_next` JS, real AppShell, Feed/Messenger/API |

Hybrid Cover WIP: branch `archive/startup-hybrid-handoff-wip` (`643e18a0d`).

---

## 3. Local / Remote 책임 경계

| Local Runtime | Remote |
|---------------|--------|
| Boot, Runtime, Shell, BottomNav, Navigation | REST/RPC APIs |
| Theme, Language bootstrap | Startup config **권위** (background sync) |
| Cached user summary, last route/tab | Auth session **검증** / refresh |
| Startup config defaults + cache | Data patch after App Ready |
| Error surface | — |
| Intro (단일 소유) | Intro **복제 금지** |

Messenger / Badge / Delivery / Feed / Realtime / Authority 도메인 로직은 **이 EPIC에서 수정하지 않는다** (데이터만 소비).

---

## 4. Android / iOS 공통 Startup 상태 머신

동일 논리 상태 (단방향 · 중복 idempotent):

```text
NATIVE_LAUNCH
  → LOCAL_RUNTIME_LOADING
  → LOCAL_RUNTIME_PAINTED
  → INTRO_VISIBLE
  → LOCAL_SHELL_READY
  → REMOTE_DATA_CONNECTING
  → APP_READY
  → INTRO_REMOVED
```

### 금지 상태 (정상 경로에 없음)

`REMOTE_DOCUMENT_LOADING` · `SECOND_INTRO` · `HANDOFF_COVER_AS_NORMAL_FLOW` · `BLANK` · `BLACK`

플랫폼별 **고정 밀리초 동기화 금지**. 맞출 것: 상태 순서 · App Ready · Intro 제거 · 시각 자산 · 중복 방지.

---

## 5. App Ready 정의

**세 조건만:**

1. Local React (또는 Local Runtime root) mounted  
2. 현재 route의 Local AppShell이 paint 가능  
3. fatal startup error 없음  

**기다리지 않음:** Feed · Messenger bootstrap · Badge · Notification · Owner store · Delivery · Remote startup config · Analytics · Realtime · 모든 이미지/폰트  

Android / iOS **동일 JS 이벤트·동일 조건**. Native 타이머로 App Ready 계산 금지.

---

## 6. Intro 단일 소유권

| 계약 | 값 |
|------|-----|
| Intro DOM instance | 1 |
| Intro owner | Local Runtime only |
| Cold show | 1 |
| Warm resume / route / bg-fg show | 0 |

Native Splash = OS 첫 프레임 **정적** 표면 (별도 애니메이션 Intro 아님).

제거 후보 (cutover 후): Boot HTML intro 복제 · Remote `DibayStartupIntro` · ConditionalAppShell startup overlay · CSS fallback intro · Native splash 위 별도 로고 animation.

---

## 7. 시각 SSOT

Background · Logo · dimensions · safe-area · Header/BottomNav silhouette · spinner · typography · Intro text · Theme  
→ `lib/startup/startup-config.ts` (+ theme/markup SSOT). 빌드 시 Android/iOS 산출물 생성. 플랫폼별 손수 색/문구 금지.

### iOS 검은 화면 (P0)

감사 필수: LaunchScreen · WKWebView background/opaque · root/controller backgrounds · local asset URL · readAccess · Cap local mapping · first navigation · JS bundle · logo in Copy Bundle Resources · safe-area.

최소 설정 (원인 해결 판정 아님): `isOpaque=false`, webView/view `backgroundColor=startupBackground` + **Local document·logo 실제 로드 증거**.

---

## 8. Local Runtime 번들 (APK/IPA)

Local HTML · JS · CSS · AppShell · Header · BottomNav · router · Theme · Language bootstrap · Cached user/route/tab · Startup defaults/cache · Error surface.

**초기 실행에 Remote HTML / `_next` 불필요.**  
Airplane mode cold: Local Runtime + AppShell 표시 · black/white 0 · 안전한 shell (로그인 또는 캐시 화면).

---

## 9. Remote 연결

Local Runtime 유지 → auth/session 복원 → remote APIs → data patch → UI 갱신.

**금지:** Remote document navigation · `location.replace` · `window.location=remote` · iframe 앱 본체 · 두 번째 React root / AppShell / BottomNav.

Cookie·Cap bridge 호환은 감사하되, 이를 이유로 Remote document를 **유지하지 않는다**. 인증 변경 필요 시 우회 금지 → **STOP + blocker 보고**.

---

## 10. Navigation 단일화

한 실행에 하나만: AppShell · Header · BottomNav · Route state · Active tab · Safe-area.

Feature flag (동시 true 금지):

```text
legacyRemoteRuntime XOR localRuntime
```

---

## 11. Startup Config / Admin

```text
Bundled default → Local cache → Immediate paint → Background remote fetch → Cache update → Next launch
```

Remote 설정 대기 후 Intro 표시 금지. Admin E2E 세션 없으면 **BLOCKED** (service-role 우회 금지).

---

## 12. `server.url` 전환 계획

| 단계 | 내용 |
|------|------|
| Now | Hybrid: `server.url` + boot intercept (legacy) |
| Local Runtime flag on | Capacitor `webDir` Local entry · **no main-frame remote document** |
| API origin | 별도 config (`REMOTE_API_ORIGIN`) — document origin과 분리 |
| Cutover | `server.url` 제거 · Hybrid boot HTML / Cover / replace 제거 |

---

## 13. Hybrid 제거 조건 (Local Runtime PASS 전 삭제 금지)

```text
Reference audit → flag cutover → Android/iOS build → device QA
  → references 0 → remove Boot HTML intercept-only path
  → remove Cover normal path → remove location.replace handoff
  → remove Remote DibayStartupIntro → rebuild → re-QA
```

---

## 14. QA 매트릭스

| 게이트 | 내용 |
|--------|------|
| Static | lint · tsc · i18n · startup verify · unit · Android compile · iOS xcodebuild |
| Offline | Airplane cold · logo · AppShell · black/white 0 · remote nav 0 |
| Online cold | Xiaomi×5 · Samsung×5 · iOS device×5 (없으면 RUNTIME BLOCKED) |
| Counts | Intro=1 · AppShell=1 · BottomNav=1 · React root=1 · replace=0 · Cover normal=0 |
| Resume/route | warm intro/cover=0 · route intro=0 · shell/nav recreation=0 |

측정(플랫폼별 수치 분리): first branded frame · local runtime paint · local shell paint · App Ready · interactive data.

---

## 15. Rollback

- Flag `localRuntime=false` → Hybrid legacy 경로 복귀 (삭제 전).
- Cutover 후 회귀 시: 직전 PASS commit + APK/IPA 재배포.
- Local Runtime 미완성 상태에서 Hybrid 경로 강제 삭제 금지.

---

## 16. Commit 전략

1. docs — architecture correction  
2. local runtime core  
3. Android integration  
4. iOS integration  
5. cutover + hybrid removal  
6. QA/docs lock  

Messenger/Badge/Delivery 무관 파일 포함 금지.

---

## 17. STOP 조건

Local Runtime을 위해 domain authority 변경 필요 · Remote HTML nav 여전히 필요 · Intro owner 플랫폼 분기 · iOS black 원인 미확정 · 이중 AppShell/React root · `location.replace` 잔존을 정상으로 잠금 · Cover를 정상 완료 조건으로 잠금 · offline에 Local Runtime 미표시.

---

## 18. 구현 진행 로그

| 날짜 | 항목 | 결과 |
|------|------|------|
| 2026-07-27 | Hybrid WIP → `archive/startup-hybrid-handoff-wip` | preserved (`643e18a0d`) |
| 2026-07-27 | Epic 정정 + 본 문서 | `da4ab481d` |
| 2026-07-27 | Local Runtime core (state/flag/markup/build/verify) + native gates | IN PROGRESS — default still `legacyRemoteRuntime` until cutover QA |
| — | `DIBAY_LOCAL_RUNTIME=1` device cutover | pending |
| — | Hybrid Boot HTML / Cover / replace 제거 | pending (after Local PASS) |
