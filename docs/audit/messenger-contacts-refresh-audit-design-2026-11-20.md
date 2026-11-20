# 메신저 친구 — 기기 저장 연락처 불러오기 재감사 · 「관리」 기능 확인 · 새로고침(스피너) 설계안

- 작성: 2026-11-20 (PHT) · 보고만(구현·배포 없음)
- 기준 코드: 로컬 `main` = `e4d4679bc`. `origin/main` = `5c3361903` 과 비교 — 연락처 관련 파일 차이 없음 (`app/(main)/layout.tsx` 에 라운지 편집기 Provider 감싸기 5줄만 추가, 연락처 동작 무관).
- 운영 DB: `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 (`begin read only … rollback`) 2026-11-20.
- 기존 설계 SSOT: `docs/design/messenger-contacts-sync-plan.md` (SSOT v5). 이 문서는 그 위의 재감사·보완 설계다.
- 용어: 화면 이름 「내 연락처의 DIBAY 회원」(`cm_contacts_section_title`) = 지시의 「저장된 친구」. 「관리」 = 친구 탭 찾기 줄 오른쪽 버튼(`cm_friend_manage_button`).

---

## 0. Owner 지시 원문과 기존 설계의 충돌 (보고 · 임의 선택 안 함)

| Owner 원문 (2026-11-10, SSOT §0) | 실제 구현 (승인된 SSOT S2·S4) | 판정 |
|---|---|---|
| 「폰에 저장된 사람은 디바이 가입시 등록」 · 「설치시 불러 오는 부분」 | 설치·가입·첫 접속만으로는 **연락처를 읽지 않는다**. 회원이 「시작하기」→ 동의 → OS 권한 허용을 해야 처음 불러온다 | **충돌** — 승인된 SSOT S2 는 동의 후 불러오기. 개인정보 동의·OS 권한 없이 설치 시 자동으로 읽는 것은 Android·iOS 모두 권한 창 없이 불가하고 개인정보처리방침과도 맞지 않음. 이번 설계는 SSOT(동의 후) 기준으로 작성. 설치 직후 자동으로 동의·권한 창을 띄우는 방식이 필요하면 Owner 결정 필요 (§5 D-1) |

---

## 1. 기기 저장 연락처는 「정확히 언제」 불러오나 (코드 감사)

불러오기 = 네이티브 `DibayContacts.readPhoneContacts()` (Android `DibayContactsPlugin.java` READ_CONTACTS · iOS `DibayContactsPlugin.swift` CNContactStore) 로 기기 연락처를 읽고, 번호를 정규화해 **이전 번호표와 비교 → 바뀐 것만 서버에 올림**. 이름은 기기 안에만 저장(서버 전송 없음). 엔진: `lib/community-messenger/contacts/contacts-sync-engine.ts` `runContactsSync`.

### 1-1. 처음 불러오는 시점 (첫 1회)

| 상황 | 자동으로 읽나 | 실제 처음 읽는 순간 | 근거 |
|---|---|---|---|
| 앱 설치·가입 직후 | **아니오** | 친구 탭 「연락처에서 친구 찾기 · 시작하기」 → 동의 화면 「동의」 → OS 권한 허용 → 즉시 전체 업로드 | `MessengerContactsFriendSection` consent 띠 → `consentAndStart()` → `requestContactsPermission()` → `sync(true, true)` |
| 이미 동의한 회원이 **새 기기/재설치** | **아니오** (설치 ID 가 바뀌어 「이 기기는 아직 허락 안 함」) | 친구 탭 섹션 안내 「이 기기 연락처도 추가할까요?」(다른 기기에 번호 있을 때) 또는 권한 띠 → 「추가」/「허용」 → 전체 업로드 | `runSync` 의 `device_not_approved` · `answerNewDevice(true)` · `requestPermissionAgain()` |
| 같은 기기에서 로그아웃 후 같은 회원 재로그인 | 예 (다시 묻지 않음) | 친구 탭 섹션이 보일 때 서버의 이 기기 출처로 복구 → 다음 동기화가 전체 업로드 1회 | `contacts-device-restore.ts` `restoreContactsDeviceFromServer` |
| 웹·Windows·플러그인 없는 구 바이너리 | 읽지 않음 | — (보기 전용·「앱 업데이트」) | `isContactsNativeAvailable()` |

### 1-2. 그 뒤 다시 읽는 시점 (변경분 비교)

| 호출처 | 시점 | 6시간 간격 적용 | 근거 |
|---|---|---|---|
| ① 앱 시작 처리 `MessengerContactsHeartbeat` (메인 레이아웃 1곳) | 앱 실행 후 **8초 + 유휴(최대 2초)**, 앱 실행 중 회원별 1번. 이 기기에서 동의한 회원만 | 예 — 마지막 동기화 후 6시간 안이면 연락처를 읽지 않음(`throttled`) | `CONTACTS_START_DELAY_MS=8000` · `CONTACTS_AUTO_SYNC_INTERVAL_MS=6h` |
| ② 친구 탭 「내 연락처의 DIBAY 회원」 섹션이 화면에 붙을 때 | 섹션 마운트 1회 (`autoSync` 기본 켜짐) | 예 | `useMessengerContacts().start` → `sync(false)` |
| ③ 「내 연락처의 DIBAY 회원」 전체 화면 진입 | 화면 마운트 1회 | 예 | 같은 훅 |
| ④ 전체 화면 머리글 ⟳ (새로고침) | 누를 때 | **아니오 (즉시)** | `refresh = sync(true)` · `RefreshCw animate-spin` |
| ⑤ OS 설정에서 권한 다시 켬 / 「다시 켜기」 | 다음 실행·누를 때 | 아니오 | `regranted` · `turnOnThisDevice` |

- 동시 실행은 회원별 1개(single-flight) — ①②가 겹쳐도 1번만 돈다.
- 결론: **폰에 새 연락처를 저장해도 자동 반영은 최대 6시간 뒤(그 뒤 앱을 열거나 친구 탭을 열 때)**. 바로 반영하는 유일한 방법은 ④ ⟳ 이다.

### 1-3. 운영 현황 (운영 DB 읽기 전용, 2026-11-20 조회)

| 항목 | 값 |
|---|---|
| 어드민 기능 스위치 `messenger_contacts_admin_settings.enabled` | `true` (최종 변경 2026-11-10 19:26 PHT) · 요청당 번호 1,000 · 하루 신규 번호 3,000 |
| 동의한 회원 (철회 제외) | 13명 |
| 기기 출처 active | Android 8 · iOS 6 (iOS 1개만 `permission_state=granted`, 나머지 `unknown`) |
| 기기 출처 removed | Android 1 · iOS 1 |
| 서버 `last_sync_at` 최신 | 2026-11-18 07:31 PHT (iOS) · Android 2026-11-17 02:03 PHT |

- 참고(판정 아님): 변경이 없으면(`unchanged`) 서버에 요청하지 않으므로 `last_sync_at` 이 멈춰 있는 것만으로 결함이라 할 수 없다. 실기기 동작은 이번에 측정하지 않음 → **NOT_PROVEN**.

---

## 2. 친구 → 「관리」 기능 확인 (코드 감사)

경로: 친구 탭 찾기 줄 `[QR] [관리]` (`MessengerFriendsHeaderActions`) → `openArchiveFromFriendsStable` → **보관함** 화면(`MessengerArchiveScreen`, `archiveFrom=friends` 로 「친구」 묶음 먼저). 메신저 설정 「친구 관리」 줄도 같은 곳.

| 묶음 | 줄 | 동작 |
|---|---|---|
| 친구 | 숨긴 친구 · 차단한 친구 · 거절한 요청 | 각 목록 상세 (해제 등) |
| 친구 | 숨긴 추천 (연락처 동의한 회원만) | 연락처 동기화 설정 `?focus=hidden` |
| 채팅 | 보관한 채팅 · 알림 끈 대화 | 각 목록 |
| 연락처 | **연락처 동기화** (「기기 n대에서 동기화」/「사용 안 함」) | 동의 회원 → 연락처 동기화 설정 화면 / 미동의 → 동의 화면 |

연락처 동기화 설정 화면(`MessengerContactsSettingsScreen`) 기능: 계정 전체 동기화 켜기/끄기 · 나를 찾을 수 있는 범위 · 가입 안내 알림 · 통화 기본값 · **기기 목록(이 기기 동기화 스위치, 다른 기기 삭제, 마지막 사용 시각·번호 수)** · 숨긴 추천 다시 보기 · 이 기기 삭제 · 전체 삭제 · 동의 철회.

### 「관리」 쪽 판정

| # | 항목 | 판정 | 내용 |
|---|---|---|---|
| G1 | 관리(보관함·연락처 동기화 설정)에서 **기기 연락처를 지금 다시 불러오기** | **FAIL (기능 없음)** | 설정 화면에 ⟳·「지금 동기화」 없음. 마지막 동기화 시각도 없음(「마지막 사용」만). |
| G2 | 친구 탭 「내 연락처의 DIBAY 회원」 섹션에서 새로고침 | **FAIL (기능 없음)** | 섹션 머리글엔 「전체 보기」만. ⟳ 는 전체 화면 머리글에만 있음 (2단계 깊이). |
| G3 | 일치 회원 0명일 때 친구 탭에서 연락처 화면으로 가는 길 | **FAIL** | 회원 0명 + 안내 띠 없음이면 섹션 자체를 그리지 않음 (`MessengerContactsFriendSection` `preview.length === 0 && !hasBanner → null`) → 「전체 보기」·⟳ 로 갈 길이 친구 탭에서 사라짐. 남은 길: 관리 → 연락처 동기화 → 설정 → 뒤로 (설정 화면 backHref = 연락처 화면). 연락처를 새로 저장한 회원이 바로 반영할 방법을 찾기 어려움. |
| G4 | 전체 화면 ⟳ 동작 | 코드 PASS · 실기 NOT_PROVEN | 6시간 무시, 누르는 동안 아이콘 회전·버튼 비활성, 결과 스낵바(확인했어요/권한/하루 한도/꺼짐/실패). |

---

## 3. 설계안 — 「관리」 + 친구 탭에 새로고침(스피너) 추가

목표: 회원이 폰에 저장한 연락처를 **원할 때 바로** 다시 불러오게 한다. 새 엔진·새 API·네이티브 변경 없이 **기존 `refresh()`(= `runContactsSync(manual)`)를 다른 두 곳에서도 부른다**.

### 3-1. 변경 항목

| ID | 위치 | 변경 | 파일 |
|---|---|---|---|
| R1 | 친구 탭 「내 연락처의 DIBAY 회원」 섹션 머리글 | 「전체 보기」 왼쪽에 ⟳ 아이콘 버튼 (44×44 터치, 아이콘 20px). 누르면 `c.refresh()` · 진행 중 `animate-spin` + `disabled` + `aria-busy`. 끝나면 결과 스낵바 1개. 앱(플러그인 있음)·동의·ready 일 때만 표시 | `components/community-messenger/contacts/MessengerContactsFriendSection.tsx` |
| R2 | 관리 → 연락처 동기화 설정 → 「기기」 묶음의 **이 기기** 줄 | 설명 줄을 「마지막 동기화 {시각} · 번호 n개」로, 오른쪽에 ⟳ 「지금 동기화」 버튼 (스위치 옆). 진행 중 스피너. 끝나면 스낵바 + 기기 목록 다시 읽기(번호 수 갱신) | `components/community-messenger/contacts/MessengerContactsSettingsScreen.tsx` |
| R3 | 결과 문구 표 공용화 | 전체 화면의 `REFRESH_RESULT_KEY`·`onRefresh` 를 공용 훅 `useContactsRefreshAction(refresh)` 로 옮겨 R1·R2·전체 화면이 같은 문구·같은 스낵바를 쓴다 | 새 `components/community-messenger/contacts/use-contacts-refresh-action.ts` · `MessengerContactsScreen.tsx` |
| R4 | 섹션 숨김 조건 (G3) | 동의·앱·ready 인데 회원 0명이면 섹션을 숨기지 않고 머리글(⟳·전체 보기) + 「연락처에 있는 DIBAY 회원이 아직 없어요」 1줄 표시 | `MessengerContactsFriendSection.tsx` — **Owner 결정 필요 (§5 D-2)**: 친구 탭에 빈 섹션 1줄이 늘어남 |

문구: 기존 키 재사용 — `cm_contacts_refresh`(새로고침) · `cm_contacts_refresh_done/stopped/limited/permission` · `cm_contacts_action_failed` · `cm_contacts_empty` · `cm_contacts_last_sync`. R2 의 「지금 동기화」 버튼 글자만 신규 키 1개 (`cm_contacts_sync_now`, ko·en 동시) — 아이콘만 쓸 경우 신규 키 없음.

### 3-2. 동작 순서 (R1·R2 공통)

```
⟳ 탭 → (버튼 비활성·스피너 시작)
  → runContactsSync(userId, { manual: true })      // 회원별 1개, 진행 중이면 같은 결과를 기다림
      권한 없음      → 「연락처 권한을 허용해 주세요」 (권한 띠는 기존대로)
      이 기기 꺼짐/지움 → 「이 기기 동기화가 꺼져 있어요」
      하루 한도      → 「오늘은 더 올릴 수 없어요…」
      readPhoneContacts → 이전 번호표와 비교
          변경 없음 → 요청 0건
          변경 있음 → delta 1건 (1,000개 초과 시 스냅숏 조각)
  → 목록 다시 받기 GET /contacts (token, 바뀌지 않았으면 notModified)
  → 스피너 끝 · 스낵바 「연락처를 확인했어요」 · 섹션/화면 목록 갱신
```

### 3-3. 영향받는 화면·호출처 (설계 규정 4번)

| 영향 | 내용 | 같은 단계 처리 |
|---|---|---|
| 친구 탭 섹션 | 머리글 오른쪽 요소 2개 — 좁은 기기에서 제목 잘림 가능 | 제목 `truncate`, ⟳ 는 아이콘만. 360px 실기 캡처로 확인 |
| 분할 화면(≥768) | 섹션과 전체 화면이 동시에 열려 ⟳ 를 양쪽에서 누를 수 있음 | single-flight 로 1번만 돌고 같은 결과 — `CONTACTS_CHANGED_EVENT`·`listCache` 로 양쪽 목록 동일 (SSOT 시험 #13 「동시 새로고침」) |
| 전체 화면 ⟳ | R3 로 코드 이동만, 동작 동일 | 기존 시험 유지 |
| 설정 화면 | 이 기기 스위치 꺼짐 상태에서 ⟳ → `stopped` 안내 | 스위치 꺼짐이면 ⟳ 비활성(회색)으로 혼동 제거 |
| 앱 시작 처리 ①·자동 ②③ | 변경 없음 (6시간 간격 유지) | — |
| 메신저 bootstrap·Realtime·방 진입 | 연결하지 않음 (SSOT 필수 조건 4) | — |
| 통화 | 닿지 않음 (통화 변경 규정 대상 아님) | — |
| 네이티브 | 변경 없음 → **웹 배포만**, 앱 재시작으로 반영. 플러그인 없는 구 바이너리는 ⟳ 미표시(기존 조건) | — |

### 3-4. 운영 요청 예산 (`docs/request-budget-ssot.md`)

- ⟳ 1회 = 최대 3건: (하루 첫 실행이면) 출처 갱신 1 + delta 1(변경 있을 때만) + 목록 1(대부분 notModified). 변경 없으면 목록 1건.
- 연타 방지: 진행 중 비활성 + single-flight. 서버 분당 10회 제한(SSOT §7) 은 그대로.
- 자동 경로는 늘지 않음 → 예산 값 변경 없음.

### 3-5. 검증 계획

- 코드: `typecheck:build` · 변경 파일 eslint · 연락처 vitest(`lib/community-messenger/contacts/__tests__`) + R1·R2 표시 조건·스피너·결과 문구 시험 추가 · `check:i18n-quality`.
- 실기 (Owner 계정·Owner 폰, Production SHA 기록, 앱 실행 상한 10회 안):
  1. 폰에 새 연락처(가입 회원 번호) 저장 → 친구 탭 ⟳ → 섹션에 바로 나옴
  2. 같은 것을 관리 → 연락처 동기화 → 이 기기 ⟳ 로 반복 · 번호 수 증가 확인
  3. 연락처 권한 끔 → ⟳ → 권한 안내
  4. 이 기기 스위치 끔 → ⟳ 비활성
  5. 일치 회원 0명 계정에서 친구 탭 섹션 표시 (R4 승인 시)
  6. Android(Samsung)·iPhone 각 1회, 360px 머리글 잘림 캡처
- 운영 DB 대조: 해당 `contact_sources.last_sync_at`·`device_version` 증가 (읽기 전용).

---

## 4. 범위 밖 결함 (보고만)

- 없음 (이번 감사 범위에서 새로 찾은 범위 밖 결함 없음).

## 5. Owner 결정 (D-1~D-3 은 계약·레거시로 정함)

| ID | 결정 | 기본안(작업자 판단) |
|---|---|---|
| D-1 | 설치·첫 접속 직후 동의·권한 창 자동 표시 | **계약으로 정함** — SSOT §18 폐기 목록 「온보딩 동의」 → 띄우지 않음 (§19 C7). 11-10 원문 「설치시 불러 오는 부분」과의 차이는 §0 대로 보고 유지 |
| D-2 | R4 섹션 상시 표시 | **레거시로 정함** — 표시 (Telegram 연락처 탭 상시, §19 C4) |
| D-3 | R2 모양 | **레거시로 정함** — KakaoTalk 친구 관리 「친구 목록 새로고침」 형식: 줄 제목 「연락처 새로고침」 + 「마지막 새로고침 {시각}」 + ⟳ (§19 C1·C3) |
| D-4 | 2단계(B) 네이티브 변경 감지 C5·C6 진행 여부 | Owner 승인 필요 — 네이티브 재빌드·스토어 심사 대상 |

## 6. 레거시 대조 (2026-11-20 추가) → 계약 SSOT §19

| 항목 | Telegram (실측) | KakaoTalk (공개 자료) | Viber (공식 도움말) | DIBAY 현재 | 계약 추가 |
|---|---|---|---|---|---|
| 폰 연락처 바뀜 자동 반영 | 앱 실행 중 연락처 변경 감시 + 1일 주기 시스템 동기화 | 자동 친구 추가 | 앱 열 때 | 앱 시작·친구 탭 진입, **6시간 간격** — 변경 감시 없음 | C5·C6 (네이티브 B) |
| 수동 새로고침 | 없음 | 설정 › 친구 관리 › 친구 목록 새로고침 (날짜) | 없음 | 전체 화면 머리글 ⟳ 만 | C1·C2·C3 (웹 A) |
| 동기화 끄기·삭제 | 연락처 동기화 스위치 · 동기화된 연락처 삭제 | 자동 친구 추가 끄기 | — | 계정·기기 스위치 · 이 기기/전체 삭제 · 동의 철회 | 동등 — 변경 없음 |
| 연락처 목록 노출 | 연락처 탭 상시 | 친구 탭 | 연락처 탭 | 0명이면 섹션 숨김 | C4 |
| 첫 불러오기 | 미측정 | 미측정 | — | 동의·권한 후 | C7 (§18 유지) |

실측 조건: Samsung SM-M156S · Android 16 · Telegram 13.2.2 (로그인 상태) · 2026-11-20 10:40 PHT. 증거: `dumpsys content` 의 `com.android.contacts/contacts: pid=<Telegram>` 관찰자 등록 · `org.telegram.messenger [com.android.contacts] PERIODIC period=1d` · 연락처 탭/개인 및 보안 화면 트리. 연락처 이름 등 개인정보는 기록하지 않음. 새로고침·동기화 버튼은 누르지 않음(읽기만). KakaoTalk 은 두 기기(Samsung 26.10.0 · Xiaomi 26.9.2) 모두 로그인 전 → 실측 **NOT_PROVEN**. DIBAY 앱 실행 0회(상한 미사용). 같은 기기 DIBAY 1.2.7(80) 은 `READ_CONTACTS granted=false`.

공개 자료: [Viber Sync and manage contacts](https://help.viber.com/hc/en/articles/9067559172253) · [삼성전자서비스 카카오톡 친구 안내](https://www.samsungsvc.co.kr/solution/37489) · [카카오톡 친구추가 설정 안내(ajd)](https://www.ajd.co.kr/contents/basic-tip/detail/%EC%B9%B4%EC%B9%B4%EC%98%A4%ED%86%A1_%EC%B9%9C%EA%B5%AC%EC%B6%94%EA%B0%80_%EC%82%AD%EC%A0%9C_%EC%B6%94%EC%B2%9C_%EB%B9%84%ED%99%9C%EC%84%B1%ED%99%94_%EB%B0%A9%EB%B2%95_1%EB%B6%84%EC%9D%B4%EB%A9%B4_%EB%81%9D!-31842)

## 7. 판정 요약

| 항목 | 판정 | 증거 |
|---|---|---|
| 기기 연락처 첫 불러오기 = 동의·권한 후 (설치 시 아님) | 코드 PASS | `use-messenger-contacts.ts` `consentAndStart` · `contacts-sync-engine.ts` `runSync` |
| 자동 재비교 = 앱 시작 8~10초 후·친구 탭/연락처 화면 진입, 6시간 간격 | 코드 PASS | `MessengerContactsHeartbeat.tsx` · `CONTACTS_AUTO_SYNC_INTERVAL_MS` |
| 즉시 새로고침은 전체 화면 ⟳ 에만 있음 | 코드 PASS (사실 확인) | `MessengerContactsScreen.tsx` |
| 관리·친구 탭 섹션의 새로고침 | FAIL (없음) | G1·G2 |
| 회원 0명일 때 친구 탭 진입로 | FAIL | G3 |
| 운영 기능 켜짐 | PASS | 운영 DB `enabled=true` |
| 실기기 불러오기·⟳ 동작 (DIBAY) | NOT_PROVEN | DIBAY 는 기기 측정 안 함 |
| 레거시 Telegram 구조 | 실측 PASS (Samsung 1대) | §6 |
| 레거시 KakaoTalk 구조 | NOT_PROVEN (공개 자료만) | §6 |
| 계약 보완 | SSOT §19 C1~C7 추가 | `docs/design/messenger-contacts-sync-plan.md` |
