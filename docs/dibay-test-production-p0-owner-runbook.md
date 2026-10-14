# DIBAY TEST / PRODUCTION — P0 Owner 런북

**정책 승인일:** 2026-10-14 · **정규 배포 복구:** 2026-10-15  
**범위:** P0 격리 자산 보존. 운영 DB 쓰기·운영 앱 무단 변경 없음.

## Owner 정책 요약 (잠금)

| 항목 | 결정 |
|---|---|
| **정규 웹 배포** | 수정 → 검증 → `main` → Vercel Production 자동 배포 (**TEST/Preview 필수 아님**) |
| TEST / Preview | **선택** — 자산 보존, Owner가 필요할 때만 사용 |
| Admin Promote (TEST→main) | 보조·실행 BLOCKED (정규 `main` 푸시와 별개) |
| 데이터 복제 | **금지** — 운영 회원 데이터 복제 없음 · 스키마 + 합성 데이터만 |
| TEST 앱 | `com.dibay.app.test` / `DIBAY TEST` |
| 결제 | 실금전 이동 없음 (stub/sandbox) |
| Native 스토어 | 웹 Production과 별도 (Play / App Store) |

## Native TEST 빌드 (코드 준비됨 — 실기기 NOT_PROVEN)

**Android:** `./gradlew :app:assembleDibayTestDebug` (flavor `dibayTest` — AGP forbids flavor name `test`; id `com.dibay.app.test`, scheme `dibay-test`).  
Sync: `npm run cap:sync:test:android` (+ `CAPACITOR_SERVER_URL` = TEST 웹 origin).

**Android Firebase (APK 차단 해제 — Owner 콘솔 필수):**  
- 운영: `android/app/google-services.json` · project `dibay-fffcd` · package `com.dibay.app` — **변경 금지**  
- TEST: `android/app/src/dibayTest/google-services.json` · package **`com.dibay.app.test`** 만  
- 저장소에 TEST Firebase 프로젝트·해당 JSON **없음** (2026-10-15 감사). Agent는 운영 Firebase에 임의 등록·신규 프로젝트 생성·검사 우회를 하지 않음.  
- Owner: TEST Firebase 프로젝트에서 Android 앱 `com.dibay.app.test` 등록 → JSON 다운로드 → 위 TEST 경로 배치. 상세: `android/app/src/dibayTest/README-google-services.md`.

**iOS:** Xcode configuration `Debug-Test` / `Release-Test` → bundle `com.dibay.app.test`, display `DIBAY TEST`, scheme `dibay-test`.  
Sync: `npm run cap:sync:test:ios`.  
**Owner 콘솔:** Apple Developer → Identifiers → App ID `com.dibay.app.test` (+ Push extension `com.dibay.app.test.DibayPushServiceExtension`) 생성·서명. 운영 App ID 변경 금지.

## QA 재사용 조사 결과 (CONFIRMED)

로컬/Preview/Production env 스냅샷·CLI linked project 모두 host=`ckdosyydvgzqwpbwuhon.supabase.co` 만 확인됨.  
별도 QA Supabase project ref는 저장소·env에 **없음**.  
테스트 fixture 문자열 `abcdefghijklmnopqrst`는 단위테스트용이며 실프로젝트가 아님.

→ **기존 QA 재사용 불가. 신규 TEST 프로젝트 생성 필요** (유료 리소스 — Owner 승인·생성).

## P0 라이브 격리 — Owner 콘솔 작업

코드만으로는 라이브 Preview가 Production DB를 끊지 못한다. 아래를 Owner가 수행한다.

### 1) Supabase TEST 프로젝트 생성

**콘솔:** https://supabase.com/dashboard  
1. New project (운영 org 또는 별도 org).  
2. Project Settings → General → Reference ID가 **`ckdosyydvgzqwpbwuhon`이 아님**을 확인.  
3. Project Settings → API → Project URL / anon / service_role 복사 (채팅·보고서에 **값 붙여넣기 금지**).  
4. Auth → URL Configuration: TEST 웹 origin 예약.  
5. **운영 회원 데이터 복제 금지** — 스키마 마이그레이션 + 합성 시드만.

### 2) Vercel TEST (또는 Preview) env

| 키 | TEST 값 | Production |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | TEST project URL | 변경 금지 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | TEST anon | 변경 금지 |
| `SUPABASE_SERVICE_ROLE_KEY` | TEST service role | 변경 금지 |
| `NEXT_PUBLIC_APP_DEPLOY_TIER` | `staging` (또는 명시적 non-production) | `production` 유지 |
| `PUSH_DISPATCH_ENABLED` | `0` until TEST FCM 준비 | 운영 정책 유지 |
| `CRON_SECRET` | **TEST 전용** (Prod와 다르게) | 운영 값 유지 |
| Agora / FCM / APNs | TEST 프로젝트 키 (P2~P3) | 운영 값 유지 |

**금지:** Production env에 TEST 키를 넣거나, TEST env에 Production service_role을 넣는 것.

### 3) Preview가 아직 Prod DB를 가리킬 때

P0 코드 게이트가 Preview에서 **cron·push side-effect를 503/차단**한다.  
운영 Production cron은 `VERCEL_ENV=production` + Prod DB이면 **그대로 허용**.

Preview를 깨지지 않게 쓰려면 **2)로 Preview/TEST env를 TEST DB로 교체**해야 한다.

### 4) §7 P1 — GitHub (P0에서는 문서만 · 적용은 Owner)

권장 (콘솔):

- `main` branch protection: PR required · Owner/승격 봇만 merge  
- 일상 개발 브랜치 → `test` (또는 지정 TEST 브랜치) → Vercel TEST  
- Direct push to `main` 금지  

**이 설정 변경은 운영 배포 관행에 영향** → Owner가 직접 적용. Agent가 GitHub org 설정을 임의 변경하지 않는다.

### 5) 로컬 개발

- `.env.local`에 Production URL을 둔 채 push/cron을 돌리면 **차단**된다 (의도).  
- TEST 검증 시 `.env.local`을 TEST 키로 교체하거나 별도 env 파일 사용.

## P0 완료 판정

| 조건 | 판정 |
|---|---|
| 코드 fail-closed + unit + verify script | Agent 실측 |
| TEST Supabase 프로젝트 존재 · Prod ref와 다름 | Owner 실측 |
| Vercel Preview/TEST가 Prod service_role을 쓰지 않음 | Owner 실측 (`vercel env ls` 등) |
| Production Vercel env / 운영 앱 / main→Git Integration 미변경 | Owner 확인 |

P0 **라이브 격리 PASS**는 Owner 콘솔 작업 완료 후에만 선언한다.
