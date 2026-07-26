# Startup Handoff Cover — Closeout QA Report (46311d6c3)

**측정 시각:** 2026-07-27 (UTC+8)  
**최종 판정:** **FAIL**

## Commits / Deploy

| 항목 | 값 |
|------|-----|
| baseline | `41ca8012d` |
| fix commit | `46311d6c3` |
| HEAD / origin/main | `46311d6c3` (push 확인: `41ca8012d..46311d6c3`) |
| Production | GitHub Vercel status **success** · deployment `BbByppBxDzxAPgYxF9sYrCdziRHC` · completed `2026-07-26T18:00:19Z` · alias `samarket.vercel.app` |
| APK | `docs/perf/dibay-startup-handoff-cover-46311d6c3.apk` |
| APK sha256 | `2a544f1cd2dc5d35b6b98173ff976f2f8c2143c781e90f0900a29da27efd5b45` |
| STALE sha256 | `c3e0a55a18b84166f37b29a3b179b9945b811ab9d6b3aceebe90c5ba975a2e78` (상이) |
| APK 검증 | `beginHandoffCover`/`endHandoffCover` dex 존재 · `res/layout/dibay_handoff_cover.xml` · assets `beginHandoffCover` count=4 |

## STOP 원인 (코드 변경 없이 보고)

### 1) Xiaomi — Cover 조기 제거 → 흰 프레임

run-02 logcat:

1. `handoff_cover_show count=1` @ 02:00:58.332  
2. `[dibay-boot] appReady reason=**warm_or_non_cold**` @ 02:00:59.750  
3. `handoff_cover_hide count=1` @ 02:01:00.398 (**shellReady 이전**)  
4. `dismissSplash reason=shellReady` @ 02:01:01.141  

30fps 증거:

- Handoff 구간 예: `handoff-window-samples/f0082.png` — cream + DIBAY logo + bottom-nav silhouette (**Cover OK**)
- Cover 제거 후: `blank-samples/f0138.png` — **로고·셸 없는 solid white** (**blank FAIL**)
- 이후 `f0163.png` — Remote 커뮤니티 UI

`blankSuspect` (센터 cream 휴리스틱)는 post-cover remote paint 구간에서 과다 계측될 수 있으나, **f0138 시각 판정은 명확한 white blank**.

### 2) Samsung — Local boot JS 오류로 Cover/replace 미발생

`samsung/run-01/logcat.txt`:

- `startup_boot_load` / intercept OK  
- `Uncaught TypeError: Cannot read properties of undefined (reading 'triggerEvent')`  
- `beginHandoffCover` / `handoff_cover_show` **0**  
- screenrecord `missing_mp4` (별도 기기 제약)

재시도(12s, no record)에서도 coverShow=0 유지.

### 3) iOS compile

`cap:sync:vercel:ios` **PASS** (storyboard `DibayStartupBridgeViewController`, asset `dibay-startup.html` 존재).  
`xcodebuild` **FAIL** — Cursor sandbox에서 SPM git hooks `Operation not permitted` (`IOS_COMPILE_FAIL`).  
실기기 runtime: **BLOCKED** (기기 없음).

## Xiaomi cold ×5 (log)

| run | coverShow | coverHide | replaceNav | shellEnd | log ok | notes |
|-----|-----------|-----------|------------|----------|--------|-------|
| 1 | 1 | 0 | 1 | 0 | false | Production deploy 직전 |
| 2 | 1 | 1 | 1 | 1 | true* | *white blank after early hide |
| 3 | 1 | 1 | 1 | 1 | true* | blankSuspect high |
| 4 | 0 | 0 | 0 | 0 | false | boot markers missing in buffer |
| 5 | 1 | 1 | 1 | 1 | true* | blankSuspect high |

warmCover=0 · routeCover=0

## Samsung cold ×5

| run | coverShow | coverHide | replace | result |
|-----|-----------|-----------|---------|--------|
| 1–5 | 0 | 0 | 0 | FAIL (JS error / no cover) |

## Admin

- wiring/static: PASS (prior)  
- PUT→DB→next cold: **BLOCKED** (관리자 세션 없음; 우회 금지)

## 산출물 경로

- `.qa-logs/startup-handoff-cover-qa/xiaomi/summary.json`
- `.qa-logs/startup-handoff-cover-qa/samsung/summary.json`
- `.qa-logs/startup-handoff-cover-qa/xiaomi/blank-samples/f0138.png` (white blank 증거)
- `.qa-logs/startup-handoff-cover-qa/xiaomi/handoff-window-samples/f0082.png` (cover OK 증거)
- `.qa-logs/startup-handoff-cover-qa/production-github-status.json`
- `.qa-logs/run-ios-handoff-build.sh` (외부 Terminal 재실행용)

## 다음 수정 후보 (이번 배치에서 미실시 — STOP)

Remote handoff 수신 시 `markAppReady("warm_or_non_cold")`가 `endHandoffCover`까지 호출하지 않도록 분리하고, Cover 제거는 **`shellReady` 전용**으로 고정.
