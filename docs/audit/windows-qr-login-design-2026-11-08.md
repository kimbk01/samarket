# PC QR 로그인 설계서 (휴대폰 디바이 앱으로 PC 로그인) · 2026-11-08 PHT

- 상태: **설계만. 구현 0건.** Owner 승인 후 구현한다.
- Owner 지시: 「QR 로그인 검토」(2026-11-08). 배경은 Windows 앱 Google 로그인이 크롬 열림 → 계정 선택 → 「DIBAY 열기」 → 복귀로 단계가 많다는 것이다(Owner 「겁나 복잡」).
- 근거:
  - 코드 사실은 `origin/main`(`a7f034f21` 이후)에서 직접 확인했다(파일:줄).
  - 데이터 사실은 운영 DB 를 읽기만 해서 확인했다.
  - 외부 사실은 §8 에 링크로 남겼다.
  - 확인하지 못한 것은 NOT_PROVEN 으로 적었다.

---

## 1. 사용자가 보는 화면 (먼저 확인받을 부분)

### PC (Windows 앱 로그인 화면)
```
┌──────────────────────────────┐
│        dibaY 시작하기          │
│   ┌────────────┐              │
│   │  QR 코드    │  ← 2분마다 새로 바뀜 (남은 시간 표시)
│   └────────────┘              │
│  휴대폰 디바이 앱으로 찍어 로그인   │
│  My → 설정 → PC 로그인 → QR 스캔  │
│  ────────── 또는 ──────────    │
│  [Google] [카카오] [Apple]     │  ← 지금 버튼 그대로
└──────────────────────────────┘
```

### 휴대폰 (디바이 앱, 로그인된 상태)
1. **My → 설정 → 「PC 로그인」 → 「QR 스캔」** 을 누르면 카메라가 열린다.
2. PC 화면의 QR 을 찍으면 **확인 화면**이 나온다.
   - 「**이 PC 에서 로그인할까요?**」
   - 기기: Windows · DIBAY 앱
   - 요청 시각: 03:20 PHT
   - 접속 위치: 국가·도시 (IP 기준)
   - 버튼: [로그인 허용] [취소]
3. **로그인 허용**을 누르면 휴대폰에 「PC 에 로그인했습니다」가 나온다.

### PC
4. 휴대폰에서 허용하면 **1~2초 안에** PC 가 같은 계정으로 홈에 들어간다. 크롬은 열리지 않는다.

- **단계:** 휴대폰에서 메뉴 → 찍기 → 허용, 3번이다. PC 에서 누를 것은 없다.
- **QR 을 찍지 않을 때:** 아무 일도 없다. 2분이 지나면 QR 이 새로 바뀐다.

## 2. 다른 앱 방식 (근거)

| 앱 | 방식 |
|---|---|
| 카카오톡 PC | 카카오계정 또는 QR 로그인. PC 로그인 때마다 휴대폰에 알림이 간다 |
| 텔레그램 PC | PC QR → 휴대폰 설정 → 기기 → 데스크톱 기기 연결 |
| 왓츠앱 PC | 휴대폰 「연결된 기기」에서 QR 스캔. 생체 인증을 거치고, 모르는 기기면 한 번 더 확인한다. 기기 목록에서 해제할 수 있다 |

디바이 설계는 텔레그램·왓츠앱과 같다. 로그인된 **휴대폰 앱 안에서만** 스캔하고, 확인 화면을 한 번 거친다.

## 3. 현재 코드·데이터 사실

| 항목 | 사실 | 근거 |
|---|---|---|
| 비밀번호 없이 기존 회원 세션 만들기 | `mintNativeOwnerSessionViaMagicLink` — `generateLink(magiclink)` 의 `hashed_token` 을 서버에서 `verifyOtp` 한다. **메일은 보내지 않는다.** 다른 회원이면 로그아웃하고 실패한다 | `lib/auth/native/native-owner-session.server.ts:100-137` |
| 그 방식의 조건 | 회원 계정 이메일이 필요하다 | 같은 파일 :107 |
| 회원 이메일 | 프로필 있는 회원 **134명 전원 이메일 있음**(49명은 내부용 `*.dibay.internal`) | 운영 DB 읽기, 2026-11-08 |
| 로그인 거부 상태 | 차단·탈퇴는 거부, 정지는 로그인 허용 | `lib/auth/member-account-state.ts:46-49` |
| 세션 기록 | `syncActiveSessionForUser` — `profiles.active_session_id`·`user_sessions` 등록 | `lib/auth/server-guards.ts:466-823` |
| 기본 정책 | 여러 기기 동시 로그인 허용(`multi_device_allow`) | `lib/auth/dibay-session-policy.ts:70-73` |
| 짧은 일회용 요청 표 | **없음** — 새 표가 필요하다 | 탐색 결과 |
| 비로그인 PC 의 실시간 수신 | 비공개 채널은 로그인 회원만 받는다. 비로그인 PC 는 받을 수 없다 → **2초 간격 확인(최대 2분)** | `20270422120000_cm_realtime_private_broadcast_authorization.sql:144-161` |
| 요청 횟수 제한·감사 기록 | `enforceRateLimit`(Upstash), `appendAuditLog` | `lib/http/api-route.ts:211`, `lib/audit/append-audit-log.ts:18-35` |
| QR 만들기·찍기 라이브러리 | **없음** (`package.json`에 QR·바코드 없음) | `package.json` |
| 휴대폰 카메라 | 통화용 `getUserMedia` 권한 경로가 있다 | `lib/call/permission-manager.ts` |

## 4. 서버 설계

### 4-1. 새 표 `pc_login_requests` (DB — 운영 적용은 별도 승인)

| 열 | 설명 |
|---|---|
| `id` uuid | 요청 번호 |
| `pc_secret_hash` | PC 만 아는 비밀값의 해시. PC 쿠키로 QR 을 그 PC 에 묶는다 |
| `qr_nonce` | QR 에 들어가는 1회용 값 |
| `status` | `pending` → `approved` → `consumed` / `expired` / `cancelled` |
| `expires_at` | 만든 뒤 **2분** |
| `approved_by_user_id`, `approved_at`, `consumed_at` | 승인한 회원, 승인 시각, 로그인 완료 시각 |
| `pc_ip`, `pc_device_info`, `approver_ip` | 확인 화면·감사용 |

- RLS 강제, `service_role` 만 접근한다(`user_sessions` 와 같은 방식).
- 만료 행은 주기 삭제한다(7일).

### 4-2. API 4개

| API | 누가 | 하는 일 |
|---|---|---|
| `POST /api/auth/qr-login/start` | PC (비로그인) | 요청 생성 → QR 내용(`요청 번호 + nonce`) 반환. PC 비밀값은 **httpOnly 쿠키**로 설정. IP 횟수 제한 |
| `GET /api/auth/qr-login/status` | PC (2초 간격) | PC 쿠키 비밀값으로 본인 요청만 조회. `approved` 이면 **그 응답에서** 세션 쿠키를 만들고 `consumed` 로 바꾼다(한 번만, 조건부 갱신) |
| `GET /api/auth/qr-login/describe` | 휴대폰 (로그인) | 확인 화면용 — 기기·시각·위치. `pending`·미만료만 |
| `POST /api/auth/qr-login/approve` | 휴대폰 (로그인) | 승인한 회원 기록 → `approved`. 차단·탈퇴 회원은 거부 |

- **세션 만들기:** 기존 `mintNativeOwnerSessionViaMagicLink` 를 그대로 쓴다. 새 세션 방식을 만들지 않는다.
- **로그인 뒤 처리:** 기존 경로를 재사용한다. 완료 경로를 둘 만들지 않는다 — 인증 잠금 §1 금지 사항이다.
  - 탈퇴 회수
  - 약관 동의 확인 → `resolveCommonAuthDestination`
  - `syncActiveSessionForUser`
- **감사 기록:** `appendAuditLog` 에 `auth.qr_login`(승인 회원·PC IP·기기)을 남긴다.

### 4-3. QR 탈취(QRLJacking) 대응 (§8 근거)

| 위험 | 대응 |
|---|---|
| 공격자가 자기 PC 의 QR 을 사용자에게 찍게 함 | 휴대폰 확인 화면에 **기기·위치·시각**을 표시하고 「로그인 허용」을 따로 누르게 한다 |
| QR 재사용·예측 | 1회용 nonce, 2분 만료, 승인·로그인 각 1회 |
| QR 과 PC 분리 | PC 쿠키 비밀값으로 묶는다 — 다른 PC 는 승인돼도 세션을 받지 못한다 |
| 무차별 시도 | IP·회원별 횟수 제한 |
| 사후 확인 | 감사 기록(추후 로그인 알림·기기 목록은 별도 단계) |

## 5. 화면 구현

- **PC:**
  - 로그인 화면(Windows 앱)에 QR 영역을 둔다.
  - QR 그림은 라이브러리(`qrcode`, npm)로 만든다 — 웹 의존성 추가.
  - 2초 간격으로 확인한다. 2분이 지나면 새 요청을 만든다.
- **휴대폰:**
  - 「PC 로그인」 메뉴와 카메라 스캔 화면을 둔다.
  - 스캔은 **웹 카메라 + JS 디코더(`jsQR`)** 로 한다 → **앱 재빌드 없음**(웹만).
  - 네이티브 스캐너 플러그인은 Android·iOS 재빌드와 스토어 업데이트가 필요해서 쓰지 않는다.
  - 카메라 권한은 통화와 같은 경로다.
  - 앱(Android·iOS) 안에서만 메뉴를 보인다. 모바일 웹에서는 숨긴다.
- **Windows 셸:** 변경 없음(로그인 화면은 웹).

## 6. 영향·배포

| 구분 | 내용 |
|---|---|
| 배포 | **웹 + DB** (표 1개). Android·iOS·Windows 재빌드 없음 |
| 기존 로그인 | Google·카카오·Apple·아이디 로그인 그대로 |
| 인증 잠금 | 새 세션 발급 경로 → **재개방 트리거 2(제품 인증 계약 변경)** — Owner 승인 필요 |
| 깨질 수 있는 것 | 세션 쿠키 발급 위치가 2초 확인 응답이 된다 → 로그인 직후 화면 이동을 기존 완료 경로로 연결했는지 계약 테스트로 고정 |
| 롤백 | 웹 커밋 되돌리기 + QR 영역 숨김. 표는 남아도 무해하다 |

## 7. 검증

- **코드:**
  - API 단위 테스트 — 만료·재사용·다른 PC·차단 회원·이중 승인
  - 계약 테스트 — 완료 경로 재사용·감사 기록
  - `typecheck`·eslint
- **실기 (Owner 화면, Production SHA 기록):**
  1. 노트북 Windows 앱에 QR 이 나오고 2분마다 바뀌는지
  2. 휴대폰(Android·iPhone 각 1회)에서 스캔 → 확인 화면 → 허용 → **PC 가 2초 안에 홈**인지
  3. 취소하면 PC 가 그대로인지
  4. 2분이 지난 QR 은 「만료」인지
  5. 같은 QR 을 두 번 찍으면 거부되는지
- **제가 직접 할 수 없는 것:** 휴대폰 카메라로 PC 화면을 찍는 실기. 그래서 Owner 확인이 필요하다. API 흐름은 테스트 계정으로 끝까지 재현해 증거를 남긴다(운영 DB 쓰기 없이 할 수 있는 범위). 그 범위는 구현 계획 때 확정한다.

## 8. 외부 근거

- 카카오톡 PC QR·로그인 알림: <https://www.kakaocorp.com/page/detail/7937?lang=ENG>
- 텔레그램 QR 로그인: <https://www.itgeared.com/how-to-login-to-telegram-using-qr-code/>
- 왓츠앱 연결된 기기(확인·해제·생체 인증): <https://faq.whatsapp.com/378279804439436/?cms_platform=android>
- QRLJacking·대응(만료·세션 묶기·확인 알림): <https://www.usenix.org/system/files/sec25_slides_zhang-xin.pdf> · <https://www.securityweek.com/new-qrljacking-attack-targets-qr-code-logins> · <https://comparitech.com/blog/information-security/what-is-qrljacking>

## 9. Owner 결정 필요

1. 인증 잠금 재개방 — **트리거 2**(새 로그인 방식).
2. QR 로그인을 보일 곳:
   - Windows 앱만 (권장 — 시작 범위 최소)
   - PC 웹사이트(크롬)에도
3. 휴대폰 메뉴 위치와 문구 — §1 안(My → 설정 → PC 로그인).
4. 확인 화면에 위치(IP 기준 도시)를 표시할지.
5. 로그인 알림·기기 목록·원격 로그아웃(카카오·왓츠앱 방식) — 이번에 넣지 않고 다음 단계로 둘지.

## 10. 보고만 (범위 밖, 고치지 않음)

- `app/api/auth/native/exchange/route.ts` 에서 보조 조사(서브 에이전트)가 지적한 내용: 93줄의 임시 응답에 넣은 `samarket_active_session_id` 쿠키가, 123줄에서 응답을 새로 만들 때 옮겨지지 않을 수 있다.
- **작업자가 직접 실행해 확인하지 않았다 — NOT_PROVEN.** QR 로그인 구현 때 같은 쿠키를 다루므로, 그때 먼저 사실 확인 후 보고한다.

## 11. 구현 기록 (2026-11-08, Owner 「그래 만들어」)

- **결정 (작업자가 권장안으로 확정, Owner 「나머지는 권장안」):**
  - QR 은 Windows 앱 로그인 화면에만 보인다.
  - 휴대폰 메뉴는 My → 설정 → PC 로그인이고, 디바이 앱(Android·iOS)에서만 보인다.
  - 확인 화면에 위치(Vercel IP 국가·도시)를 표시한다.
  - 로그인 알림·기기 목록은 다음 단계로 둔다.
- **파일:**
  - 서버: `lib/auth/pc-qr-login/*`(계약·저장소·세션), `app/api/auth/qr-login/{start,status,describe,approve}`
  - 화면: `components/auth/PcQrLoginPanel.tsx`(PC), `components/my/settings/PcLoginScanContent.tsx`(휴대폰)
  - 등록: 설정 행 `{ kind: "pc-login" }`, 항목 등록, 문구(ko·en)
  - DB 파일: `supabase/migrations/20271108150000_pc_qr_login_requests.sql`
  - 의존성: `qrcode` 1.5.4, `jsqr` 1.4.0, `@types/qrcode` 1.5.5
- **계획과 다른 점:**
  1. QR 내용을 URL 대신 `dibay-pc-login:v1:<id>:<nonce>` 로 했다. 다른 카메라 앱이 여는 주소가 없어서 앱 안 스캐너에서만 의미가 있다.
  2. 중앙 변경 게이트 EXEMPT 를 14 → 16 으로 늘렸다(고정 개수 테스트와 인벤토리 함께 갱신). 인벤토리 요약 total 은 presence(2026-11-01) 반영 누락을 함께 정정해 313 이다.
- **로컬 검증 (코드 PASS):**
  - QR 로그인 테스트 18건 — 1회용·만료·PC 결합·차단·탈퇴·쿠키 이동·동시 소비
  - 관련 테스트 3,922건, `typecheck:build`·`typecheck:test`, eslint
  - 서브 에이전트가 지적한 `native/exchange` 활성 세션 쿠키 문제와 같은 일이 QR 에서 생기지 않게, 상태 응답은 `cookieCarrier` 쿠키를 최종 응답으로 옮긴다(테스트로 고정). `native/exchange` 자체는 범위 밖이라 고치지 않았다(NOT_PROVEN 보고 유지).
- **운영:** DB 미적용 상태로 반영하면 QR 영역은 숨겨지고 기존 로그인은 그대로다. 실기는 DB 적용 후 Owner 휴대폰 스캔으로 확인한다.

## 12. 화면 수정 (2026-11-08, Owner 「그래 좋아」)

- **Windows 앱 로그인 화면**
  - 처음에는 **QR 만** 보인다.
  - QR 아래 「모바일이 없으세요?」를 누르면 기존 로그인(Google·카카오·Apple·아이디)이 나온다.
  - 그 아래 「QR로 로그인」을 누르면 다시 QR 로 돌아간다.
  - QR 을 만들 수 없으면(서버 오류) 기존 로그인을 바로 보이고, 「QR로 로그인」도 숨긴다.
- **PC 크롬·Android·iPhone 로그인 화면:** 그대로다(Windows 셸 판정 false).
- **휴대폰 허용 완료:** 「PC에 로그인되었습니다.」 + **[확인]** → 내정보(`/mypage`).
- **확인 못 함:** Windows 앱에서 처음 열 때 기존 버튼이 한 순간 보였다가 QR 로 바뀌는지(서버 렌더는 Windows 판정 false) — NOT_PROVEN, 노트북 실기에서 본다.

