# 문서 A — Cursor 실행 프롬프트: AUTH PR #125 Production 반영 · Kakao 환경변수 확인 · 운영 검증

> 사용법: Mac(`/Users/bkkim/projects/samarket`) Cursor 에서 아래 「프롬프트」 블록 전체를 붙여 넣는다.
> 이 문서는 PR #125 브랜치에 있다 — main 에서 보려면: `git fetch origin claude/charming-einstein-ndikqs && git show origin/claude/charming-einstein-ndikqs:docs/audit/auth-2026-10-21/A-cursor-auth-production-merge-verify-prompt.md`
> `vercel`·`gh`·`adb` 는 **일반 터미널**에서 실행한다 (Cursor 샌드박스 금지 명령 없음 — 빌드 없음).

## 작성 시점 사실 (2026-10-21 PHT, 클라우드 세션 확인)

- PR [kimbk01/samarket#125](https://github.com/kimbk01/samarket/pull/125) — head `claude/charming-einstein-ndikqs` · 최신 커밋 `0b5d1a55` (CI 계약 스크립트 수정 포함). **미병합.**
- 근거 문서: `docs/dibay-auth-full-audit-ssot-design-2026-10-21.md` §8 (36건 중 35 완료 · P2-13 네이티브 필요로 미완).
- 로컬 검증: `npm run ci` 각 단계 PASS (vitest 16,801 + 잔여 수정 경로) · `typecheck:build`·`typecheck:test` PASS · lint 0 errors.
- 운영 DB 변경 6건 **이미 적용됨** (`auth_ssot_*` 마이그레이션 6개) — 현재 Production 코드와도 호환.
- **병합 차단 사유:** PR #125 는 Kakao native 로그인을 fail-closed 로 바꾼다 — Production `KAKAO_APP_ID` 가 없거나 숫자가 아니면 Kakao Android 로그인이 **503 `native_provider_unconfigured`** 로 막힌다. Kakao 회원 8명 중 4명이 14일 내 로그인(마지막 2026-10-21 20:49 PHT). 클라우드 세션은 Vercel 403 으로 env 확인 불가.
- 네이티브 변경 0건 → `[배포 구분] 웹만` (APK·iOS 재빌드 불필요).

---

## 프롬프트

```
너는 DIBAY AUTH 운영 반영 담당이다. AGENTS.md 절대 금지·개발 프로세스를 따른다.
목표: (1) Production KAKAO_APP_ID 확인 → (2) PR #125 병합 → (3) Production READY·SHA 확인 → (4) 운영 검증 → (5) 1회 보고.
제한:
- 코드 수정 금지. 새 감사·설계·기능 추가 금지.
- 환경변수 **값을 화면·로그·보고에 출력하지 않는다** (존재·형식만).
- Vercel·Supabase·GitHub 설정 변경 금지 (env 추가·수정 포함 — Owner 별도 승인 사항). 롤백도 Owner 판단.
- 운영 DB 는 SELECT 만. 회원 데이터 변경 금지. 테스트 DB(dibay-test·dibay-reset-qa) 접근 금지.
- CI 는 병합 직전 1회만 확인(반복 폴링 금지).
- 확인 못 한 것은 PASS 가 아니라 NOT_PROVEN.

(1) Production KAKAO_APP_ID — 값 노출 없이 확인
- `vercel env ls production --scope kimbk01s-projects 2>/dev/null | grep -E "^\s*KAKAO_APP_ID\b" && echo KAKAO_APP_ID_PRESENT || echo KAKAO_APP_ID_MISSING`
- PRESENT 이면 형식만 확인 (값 출력 금지, 임시 파일은 즉시 삭제):
    vercel env pull /tmp/dibay-prod.env --environment=production --scope kimbk01s-projects --yes >/dev/null 2>&1
    node -e 'const fs=require("fs");const l=fs.readFileSync("/tmp/dibay-prod.env","utf8").split("\n").find(x=>x.startsWith("KAKAO_APP_ID="));const v=(l||"").slice(13).replace(/^"|"$/g,"").trim();console.log(v?(/^\d+$/.test(v)?`KAKAO_APP_ID format=numeric digits=${v.length}`:"KAKAO_APP_ID format=NOT_NUMERIC"):"KAKAO_APP_ID empty")'
    rm -f /tmp/dibay-prod.env
- 판정:
  · MISSING / empty / NOT_NUMERIC → **STOP. 병합하지 않는다.** 보고: 「Kakao Developers → 내 애플리케이션 → DIBAY 앱 → 앱 키 화면의 "앱 ID"(숫자)를
    Vercel Production env `KAKAO_APP_ID` 로 등록 필요 (Owner 조치)」. 이후 단계 생략하고 (5) 보고.
  · numeric → Owner 에게 「Kakao Developers 앱 ID 와 Vercel 값이 같은지」 1회 확인 요청 (값은 Owner 가 두 콘솔에서 직접 비교).
    Owner 가 일치 확인하면 (2) 진행. 응답이 없으면 STOP 하고 (5) 보고.

(2) PR #125 병합
- `gh pr view 125 --json state,mergeable,headRefOid,statusCheckRollup` 1회 — headRefOid 가 0b5d1a55… 로 시작, mergeable=MERGEABLE 확인.
  체크 실패가 있으면 실패 체크 이름·로그 마지막 50줄을 원문 보고하고 STOP (재실행·우회 금지).
- `gh pr merge 125 --merge --delete-branch=false`
- 거부(브랜치 보호·권한)되면 우회하지 말고 원문 보고 후 STOP.
- `git fetch origin main && git log --oneline -1 origin/main` → 병합 커밋 SHA 기록.

(3) Production READY · SHA
- `vercel ls samarket --prod --scope kimbk01s-projects` 에서 최신 Production 배포가 READY 이고 커밋이 (2) 병합 SHA 인지 확인.
  BUILDING 이면 5분 후 1회만 재확인. ERROR 면 `vercel inspect <url> --logs` 마지막 80줄 원문 보고 후 STOP.

(4) 운영 검증 (READY 이후)
4-1. 서버 응답 (비로그인, 회원 데이터 변경 없음)
    curl -s -o /dev/null -w "naver_start %{http_code}\n" https://samarket.vercel.app/api/auth/naver/start                 # 기대 410
    curl -s -o /dev/null -w "naver_callback %{http_code}\n" "https://samarket.vercel.app/api/auth/naver/callback?code=x"   # 기대 410
    curl -s -o /dev/null -w "oauth_start_naver %{http_code}\n" "https://samarket.vercel.app/api/auth/oauth/start?provider=naver"  # 기대 403 (provider_disabled) 또는 400
    curl -s -X POST -H "content-type: application/json" -d '{"email":"probe@example.com"}' -o /dev/null -w "conflict_check %{http_code}\n" https://samarket.vercel.app/api/auth/provider/conflict-check   # 기대 401
    curl -s "https://samarket.vercel.app/api/auth-providers?enabled=true" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const p=(j.providers||[]).map(x=>x.provider);console.log("providers",p.join(","),"secret_field_present",s.includes("client_secret\""))})'
    # 기대: providers 에 google,kakao,apple · naver/facebook 없음 · secret_field_present false
4-2. 운영 DB (SELECT 만)
    -- 16개 테이블 회원 쓰기 권한 회수 유지
    select t, has_table_privilege('authenticated','public.'||t,'insert') or has_table_privilege('authenticated','public.'||t,'update') dml
    from unnest(array['comments','post_comments','price_offers','favorites','community_friend_requests','product_chats','product_chat_messages','transaction_reviews','chat_rooms','reports','user_blocks','community_post_likes','meeting_members','store_orders','store_order_items','store_payments']) t;   -- 기대 전부 false
    -- provider secret 평문 없음
    select provider, client_secret_configured, client_secret like 'vault:%' vault_ref from auth_providers;  -- 기대 google/kakao/apple configured=true, vault_ref=true
4-3. Vercel 런타임 로그 (배포 후 1시간, 값·토큰 출력 금지 — 이벤트 이름과 건수만)
    vercel logs samarket --scope kimbk01s-projects --since 1h 2>/dev/null | grep -oE "kakao_app_id_env_missing|kakao_token_app_mismatch|google_native_magiclink_fallback|oauth_rebind_failed|oauth_identity_persist_failed|auth_state_unavailable|account_restricted" | sort | uniq -c
    # 기대: kakao_app_id_env_missing 0 · kakao_token_app_mismatch 0. 나머지는 건수만 기록.
4-4. 실기기 (샤오미 adb 연결 시. 없으면 NOT_PROVEN)
    a) Kakao 로그인: 앱 실행 → 로그아웃 상태에서 Kakao 로그인 → 홈 진입. 실패 시 화면 문구와 시각(PHT) 기록.
    b) Google 로그인: 로그아웃 → Google 로그인 → 홈 진입 (기존 회원 재로그인).
    c) 계정 전환: Kakao 계정 A 로그아웃 → Google 계정 B 로그인 → 채팅 목록·알림·주소에 A 데이터가 없는지 확인 (스크린샷 /tmp/dibay-check/auth/*.png).
    d) 기기 연결 (SELECT):
       select user_id = '<B 의 user id>' is_b, is_active, app_version, last_seen_at at time zone 'Asia/Manila'
       from user_devices where device_id = '<앱 client_instance_id>' order by last_seen_at desc;
       -- 기대: B 행 is_active=true · A 행 is_active=false  (user id·device id 원문은 보고에 쓰지 않고 is_b/true·false 만)
    e) 정지·약관·관리자 게이트는 자동 테스트 PASS 로 갈음하고 실기기는 NOT_PROVEN (운영 회원 상태 변경 금지).
4-5. iOS (iPhone 연결 시만): Apple 로그인 → 홈 진입. 없으면 NOT_PROVEN.
4-6. 웹 2탭: 브라우저 탭 2개로 A 로그인 → 탭1 로그아웃 → 탭2 가 /login 으로 새로고침되는지 확인. 불가하면 NOT_PROVEN.

(5) 최종 보고 (1회, 이 순서)
첫 줄: `npm run verify:native-version-bump` 의 [배포 구분]
1. KAKAO_APP_ID — PRESENT/MISSING · 형식(numeric·자릿수) · Owner 일치 확인 여부 (값 미기재)
2. PR #125 — 병합 여부 · 병합 SHA (또는 STOP 사유 원문)
3. Production — READY 여부 · 배포 SHA
4. 서버 응답 4-1 — 항목별 HTTP 코드 · providers 목록 · secret_field_present
5. 운영 DB 4-2 — 16개 테이블 dml 결과 · secret vault_ref
6. 런타임 로그 4-3 — 이벤트별 건수
7. 실기기 4-4~4-6 — Kakao/Google/계정 전환/기기 연결/iOS Apple/웹 2탭: PASS · FAIL(증상·시각 PHT) · NOT_PROVEN
8. 남은 것 — Owner 조치만 (Supabase 대시보드: 공개 이메일 가입·자동 확인 / Realtime "Allow public access" OFF 확인,
   P2-13 네이티브 nonce 별도 승인). 그 외 없으면 「AUTH 운영 반영 종료」.
FAIL 이 하나라도 있으면 원인 추측으로 수정하지 말고 증상·로그 원문만 보고한다 (롤백 여부는 Owner 판단).
```

## P2-13 (이번 반영 제외 — 참고)

- 범위: iOS `NativeAppleAuthPlugin.swift` 가 JS 가 준 nonce 를 쓰도록 변경 · Android `NativeGoogleAuthPlugin.java` 에 nonce 지원 추가 · 서버 1회용 nonce 발급 후 native exchange 에서 필수화.
- 앱 재빌드: Android `versionCode`·iOS build 번호 1회 증가 + 스토어 제출 필요.
- 호환 위험: 구 바이너리는 서버 nonce 를 보낼 수 없음 → 즉시 필수화하면 구 버전 iOS Apple·Android Google 로그인 불가. 최소 버전 강제 전까지 서버는 nonce 없는 요청 허용 필요.

## 결과 1차 (2026-10-21 PHT, Cursor 보고)

- `[배포 구분] 웹만` · **STOP — PR #125 미병합.**
- `KAKAO_APP_ID` — **MISSING** (Vercel Production env 에 Kakao 관련 변수 없음). 형식·일치 확인 해당 없음.
- 병합·Production·운영 검증(4–7) — 병합 전 STOP 으로 미진행.
- **Owner 조치:** Kakao Developers → 내 애플리케이션 → DIBAY 앱 → 앱 키 화면의 앱 ID(숫자)를 Vercel Production env `KAKAO_APP_ID` 로 등록 → 이 프롬프트 재실행 (1) 부터.
