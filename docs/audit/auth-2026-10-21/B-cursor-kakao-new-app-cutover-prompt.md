# 문서 B — Cursor 실행 프롬프트: Kakao 새 앱 전환 + PR #125 반영 + Android APK 재빌드

> 사용법: Owner 가 아래 「Owner 사전 작업」을 끝낸 뒤 Mac(`/Users/bkkim/projects/samarket`) Cursor 에 「프롬프트」 블록 전체를 붙여 넣는다.
> 이 문서는 PR #125 브랜치에 있다 — `git fetch origin claude/charming-einstein-ndikqs && git show origin/claude/charming-einstein-ndikqs:docs/audit/auth-2026-10-21/B-cursor-kakao-new-app-cutover-prompt.md`
> `vercel`·`gh`·`adb`·gradle 은 **일반 터미널**에서 실행한다 (`docs/native-build-release-process.md` §4).

## 배경 (2026-10-21 PHT)

- 기존 Kakao Developers 계정 분실 → **새 계정·새 Kakao 앱으로 전환** (Owner 결정: 기존 Kakao 회원 8명은 모두 테스트 계정 — 새로 시작).
- 새 앱은 앱 ID·네이티브 앱 키·REST API 키·Client Secret 이 모두 바뀐다. Kakao 회원번호도 앱마다 달라 **기존 Kakao 테스트 계정과 연결되지 않고 새 계정으로 가입**된다 (의도된 결과). 기존 테스트 회원 데이터는 삭제하지 않는다(삭제는 별도 Owner 승인).
- 저장소 코드 변경 없음: Android 네이티브 앱 키는 `android/local.properties`(gitignore) 또는 env `KAKAO_NATIVE_APP_KEY` 로 **빌드 시 주입** → **새 APK 빌드·설치 필요**.
- iOS 카카오 로그인은 웹 OAuth(Supabase) 경로 → iOS 재빌드 불필요.
- PR #125: Production `KAKAO_APP_ID` 없으면 Kakao Android 로그인 503 (fail-closed) → 새 앱 ID 등록 후 병합.

## Owner 사전 작업 (콘솔 — Cursor 가 할 수 없음)

1. **Kakao Developers (새 계정)** — 애플리케이션 추가 (이름 DIBAY)
   - 앱 키 화면에서 기록: **앱 ID(숫자)** · **네이티브 앱 키** · **REST API 키** (+ 보안 → **Client Secret** 생성·활성화)
   - 플랫폼 → **Android**: 패키지 `com.dibay.app`, 키 해시 3개 등록
     · debug: `keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | openssl sha1 -binary | openssl base64`
     · release(업로드 키 `CN=DIBAY Play Upload`): `keytool -exportcert -alias <업로드키 alias> -keystore <업로드 keystore 경로> | openssl sha1 -binary | openssl base64`
     · Google Play 배포본: Play Console → 앱 무결성 → **앱 서명 키 SHA-1** → `echo <SHA1 콜론 제거> | xxd -r -p | openssl base64`
   - 플랫폼 → **iOS**: 번들 ID `com.dibay.app` · 플랫폼 → **Web**: `https://samarket.vercel.app`
   - 카카오 로그인 → **활성화 ON** · Redirect URI: `https://ckdosyydvgzqwpbwuhon.supabase.co/auth/v1/callback`
   - 동의항목: **닉네임(profile_nickname)**, **프로필 사진(profile_image)** 사용 설정 (이메일 불필요)
2. **Supabase 대시보드** (`kimbk01's Project`) → Authentication → Providers → **Kakao**: Client ID = 새 **REST API 키**, Client Secret = 새 **Client Secret** → Save
3. ~~DIBAY 관리자 Kakao 키 저장~~ → **PR #125 배포 후**에 한다 (구 코드는 비밀값을 평문으로 저장 — 프롬프트 (3) 뒤 Owner 확인 단계)
4. **Vercel** → samarket → Settings → Environment Variables → `KAKAO_APP_ID` = 새 **앱 ID(숫자)**, Environment **Production** → Save
5. **Mac 로컬** `android/local.properties` 의 `KAKAO_NATIVE_APP_KEY=` 를 새 **네이티브 앱 키**로 교체 (커밋 금지 — gitignore 파일)

---

## 프롬프트

```
너는 DIBAY AUTH Kakao 새 앱 전환 + 운영 반영 담당이다. AGENTS.md 절대 금지·개발 프로세스, docs/native-build-release-process.md 를 따른다.
목표: (1) 설정 확인 → (2) PR #125 병합 → (3) Production READY·SHA → (3-1) Owner 확인 요청 (1회): 「DIBAY 관리자 → 로그인 설정 → Kakao 에 새 REST API 키·Client Secret 저장 (이제 Vault 저장)」 완료 응답 후 진행.
  확인(SELECT): select client_secret_configured, client_secret like 'vault:%' vault_ref, updated_at at time zone 'Asia/Manila' from auth_providers where provider='kakao';  -- 기대 true · true · 방금 시각

(4) Android APK 빌드·설치 → (5) Kakao 로그인 실기기 검증 → (6) 1회 보고.
제한:
- 코드·네이티브 소스 수정 금지. 버전 번호 임의 변경 금지. 스토어 업로드·출시 금지.
- 환경변수·키 **값 출력 금지** (존재·형식·길이만). local.properties 커밋 금지.
- Vercel·Supabase·Kakao 콘솔 설정 변경 금지 (Owner 사전 작업 확인만). 롤백은 Owner 판단.
- 운영 DB 는 SELECT 만. 회원 데이터 변경·삭제 금지. 테스트 DB 접근 금지.
- CI 는 병합 직전 1회만. 확인 못 한 것은 NOT_PROVEN.

(1) 설정 확인 (값 미출력)
- Vercel: `vercel env ls production --scope kimbk01s-projects | grep -E "^\s*KAKAO_APP_ID\b" && echo PRESENT || echo MISSING`
  PRESENT 면 형식만:
    vercel env pull /tmp/dibay-prod.env --environment=production --scope kimbk01s-projects --yes >/dev/null 2>&1
    node -e 'const l=require("fs").readFileSync("/tmp/dibay-prod.env","utf8").split("\n").find(x=>x.startsWith("KAKAO_APP_ID="));const v=(l||"").slice(13).replace(/^"|"$/g,"").trim();console.log(v&&/^\d+$/.test(v)?`numeric digits=${v.length}`:"INVALID")'
    rm -f /tmp/dibay-prod.env
  MISSING/INVALID → STOP, Owner 사전 작업 4번 필요 보고.
- Android 키: `node -e 'const f=require("fs");const t=f.existsSync("android/local.properties")?f.readFileSync("android/local.properties","utf8"):"";const m=t.match(/^KAKAO_NATIVE_APP_KEY=(.*)$/m);const v=(process.env.KAKAO_NATIVE_APP_KEY||(m&&m[1])||"").trim();console.log(/^[a-f0-9]{32}$/.test(v)?"native_key format=hex32":"native_key INVALID_OR_MISSING")'`
  INVALID → STOP, Owner 사전 작업 5번 필요 보고.
- Owner 에게 1회 확인: 「Kakao 콘솔(키 해시 3개·Redirect URI·로그인 ON·동의항목)·Supabase Kakao 저장 완료?」 → 완료 응답 후 진행.

(2) PR #125 병합
- `gh pr view 125 --json state,mergeable,headRefOid,statusCheckRollup` 1회. 실패 체크 있으면 이름·로그 마지막 50줄 원문 보고 후 STOP.
- `gh pr merge 125 --merge` → 거부되면 원문 보고 후 STOP.
- `git checkout main && git pull --ff-only origin main && git log --oneline -1` → 병합 SHA 기록.

(3) Production READY
- `vercel ls samarket --prod --scope kimbk01s-projects` → 최신 Production READY · 커밋 = 병합 SHA. BUILDING 이면 5분 후 1회만 재확인. ERROR 면 `vercel inspect <url> --logs` 마지막 80줄 보고 후 STOP.
- 비로그인 응답:
    curl -s -o /dev/null -w "naver_start %{http_code}\n" https://samarket.vercel.app/api/auth/naver/start    # 기대 410
    curl -s -X POST -H "content-type: application/json" -d '{"email":"probe@example.com"}' -o /dev/null -w "conflict_check %{http_code}\n" https://samarket.vercel.app/api/auth/provider/conflict-check   # 기대 401
    curl -s "https://samarket.vercel.app/api/auth-providers?enabled=true" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("providers",(j.providers||[]).map(x=>x.provider).join(","),"secret_in_body",s.includes("client_secret\""))})'
    # 기대 google,kakao,apple · secret_in_body false

(4) Android APK (일반 터미널) — 키 교체 반영용 재빌드
- `npm run verify:native-version-bump` 첫 줄 [배포 구분] 기록 (저장소 네이티브 변경 0 → 번호 추가 증가 불필요가 정상).
- `npm run native:prepare` — 실패하면 원문 보고 후 STOP (우회 금지).
- `cd android && ./gradlew assembleRelease` (경고 "KAKAO_NATIVE_APP_KEY is not set" 이 나오면 STOP)
- 설치: `adb -d install -r app/build/outputs/apk/release/app-release.apk` → `adb shell dumpsys package com.dibay.app | grep -E "versionCode|versionName"`

(5) 실기기 검증 (샤오미)
a) 앱 실행 → 로그아웃 상태 → **카카오 로그인** → 카카오 계정 화면 → DIBAY 복귀 → (새 회원이면) 약관 동의 화면 → 동의 → 홈. 스크린샷 /tmp/dibay-check/kakao-new/*.png
   실패 시 화면 문구·시각(PHT)·`adb logcat -d | grep -iE "kakao|native_exchange" | tail -40` 원문 기록.
b) 로그아웃 → **Google 로그인**(기존 회원) → 홈 (기존 데이터 표시).
c) 계정 전환: Google 회원 로그아웃 → Kakao 회원 로그인 → 채팅·알림·주소에 Google 회원 데이터 없음.
d) 운영 DB (SELECT, 원문 id 보고 금지):
   select count(*) filter (where provider='kakao' and created_at > now() - interval '1 hour') new_kakao_identity_1h from user_auth_identities;   -- 기대 ≥1
   (Vercel 로그) vercel logs samarket --scope kimbk01s-projects --since 1h | grep -oE "kakao_app_id_env_missing|kakao_token_app_mismatch|native_provider_unconfigured" | sort | uniq -c   -- 기대 0
e) 웹(PC 브라우저) 카카오 로그인 1회 — Supabase Kakao 새 키 확인. 탭 2개 로그인 → 탭1 로그아웃 → 탭2 /login 새로고침 확인.
f) iOS: 카카오는 웹 OAuth — iPhone 있으면 카카오·Apple 로그인 1회, 없으면 NOT_PROVEN (iOS 재빌드 안 함).

(6) 최종 보고 (1회, 이 순서)
첫 줄: [배포 구분]
1. 설정 — KAKAO_APP_ID(numeric·자릿수) · Android 네이티브 키 형식 · Owner 콘솔 완료 확인
2. PR #125 — 병합 SHA (또는 STOP 사유 원문)
3. Production — READY · 배포 SHA · 비로그인 응답 3개
4. Android — native:prepare 결과 · versionCode/Name · 설치 여부
5. 실기기 a~f — PASS / FAIL(증상·시각·로그 원문) / NOT_PROVEN
6. 로그 이벤트 건수 · 새 Kakao identity 건수
7. 남은 것 — Owner 조치만 (Supabase 공개 이메일 가입·Realtime public access 확인 · P2-13 네이티브 nonce 별도 승인 · 기존 Kakao 테스트 회원 정리 여부).
FAIL 이 있으면 추측 수정 금지 — 증상·로그 원문만 보고.
```

## 전환 중 영향 (참고)

- Supabase Kakao 키 교체 즉시: 웹·iOS 카카오 로그인 = 새 앱 (기존 Kakao 테스트 계정과 분리된 새 계정).
- PR #125 배포 후 ~ 새 APK 설치 전: **구 키 APK 의 Android 카카오 로그인은 401** (`kakao_token_app_mismatch` — 다른 앱 토큰 거부, 의도된 fail-closed). 새 APK 설치로 해소.
- Google·Apple·아이디 로그인은 영향 없음.
