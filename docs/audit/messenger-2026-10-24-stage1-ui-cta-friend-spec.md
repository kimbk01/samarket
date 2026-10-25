# DIBAY 메신저·채팅·통화 — 1단계: UI·UX·CTA 공통 기준 + 친구 기능 정리 (2026-10-24 · Claude · 문서만)

- **승인 범위**: 문서 작성과 기존 계획 정합성 정리만이다. 코드·main·Production·DB 는 바꾸지 않았다.
- **기준**
  - `origin/main` = `21210d2b1`
  - 묶음7 브랜치 = `8d9b4c7cb`
- **선행 감사**: `messenger-2026-10-24-claude-status-audit.md` (같은 감사는 반복하지 않는다)
- **기존 계획**
  - `messenger-2026-10-22-reaudit-plan.md`
  - `messenger-side-defect-ledger-2026-10-23.md`
  - `DIBAY_메신저_통화_기존계획_계속진행_및_별도결함관리_20261023.md`
- **변경 금지 확인**
  - Android·iOS 네이티브 통화 파일 수정 없음.
  - `dibay-test` 사용 없음.
  - 운영 DB 변경·조회 없음.

---

## 1. UI·UX·CTA 공통 기준

DIBAY 는 **라이트 모드 전용**(다크모드 없음)이다. 아래 값은 모두 이미 있는 규정(`app/design-tokens.css`, `app/dibay-overlay.css`, `docs/customer-platform/04-DESIGN-SYSTEM.md`, `lib/ui/design-system-hard-lock.ts`)에서 가져왔다. 새 값은 만들지 않는다.

### 1-1. 색

| 용도 | 기준 토큰 | 값 | 현재 위반 |
|---|---|---|---|
| 브랜드 녹색(주 버튼·강조) | `--sam-primary` (= `--dibay-green`) | **#0B421A** | 오버레이 SSOT `--overlay-primary` #085c3f, 묶음7 `GroupMentionAutocomplete` #006241 |
| 눌림 | `--sam-primary-active` | 녹색 78% + 검정 | 오버레이 `--overlay-primary-dark` #084732 |
| 비활성 버튼 | `--sam-primary-disabled` 배경 + `--sam-text-muted` 글자 (`Sam.btn.disabledToken`, **불투명도 처리 금지**) | — | 친구 팝업·요청 버튼 `active:opacity-90` |
| 위험(삭제·차단·거절 강조·오류 글자) | `--sam-danger` | #d45252 | 오버레이 `--overlay-danger` #e53935 |
| 제목 글자 | `--sam-text-primary` (= `--dibay-brown`) | #362415 | 오버레이 `--overlay-text-primary` #111111 |
| 본문 보조 글자 | `--sam-text-secondary` | #604C4C | 오버레이 #666666 |
| 테두리 | `--sam-border-default` | — | 오버레이 #e5e7e8 |
| 녹색 위 글자 | `--sam-text-on-primary` (= `--dibay-cream`) | #FFFCFC | 일부 `text-white` 직접 지정 |

- **결정**: 브랜드 녹색은 **#0B421A 하나**로 한다. 근거는 AGENTS.md 「UI 토큰」과 `design-system-hard-lock.ts` `primaryHex`.
- 오버레이 SSOT 의 #085c3f·#e53935·#111111 은 앱 토큰과 어긋나 있다. 전역 수정(2단계 W-0)으로 `--overlay-*` 가 `--sam-*` 를 가리키게 한다.
- 메신저 전용 `--messenger-*` 는 이미 `--sam-*` 를 가리키므로 그대로 쓴다.

### 1-2. 글자 위계 (제목·본문 구분)

| 위치 | 제목 | 본문 |
|---|---|---|
| 중앙 팝업(다이얼로그) | `--overlay-title-2` 18px/600, 마침표 없음, **상태 이름만** (예: 「응답 없음」) | `--overlay-body-2` 14px/400, 문장 1~2개, **마침표로 끝냄**. 제목을 반복하지 않음 |
| 바텀시트 | 시트 제목 18px/600 | 목록은 `sam-text-body`, 보조 줄은 `sam-text-helper` |
| 목록 행 | 이름 `sam-text-body` 600 | 보조 줄(@아이디·상태) `sam-text-helper`, 색 `--sam-text-secondary` |

### 1-3. 모서리 (04-DESIGN-SYSTEM Radius LOCKED)

| 대상 | 기준 | 현재 위반 |
|---|---|---|
| 화면에 붙은 카드·목록·입력·칩·버튼 | 4px `rounded-ui-rect` | 묶음4 입력창 `rounded-[18px]` |
| 중앙 다이얼로그 패널 | 16px `--overlay-radius-lg` | 친구 팝업·받은 요청 시트·친구 추가 시트가 4px |
| 바텀시트 위쪽 | 24px `--overlay-radius-xl` | 위와 같음 |
| 다이얼로그·시트 안 버튼 | 12px `--overlay-radius-md` | 친구 팝업 버튼 4px |
| 아바타·토글·배지 | pill | — |
| 로고 | 임의값 금지(현재 E-C3 로고 10px) | `call-in-app-notice-center.css` |

### 1-4. 버튼 (CTA) 위계와 상태

| 구분 | 클래스 | 쓰는 곳 |
|---|---|---|
| 주 행동(1개) | `Sam.btn.primaryCombo` | 수락 · 친구 요청 · 확인 |
| 보조 | `Sam.btn.secondaryCombo` 또는 `outlinePrimaryCombo` | 거절 · 나중에 · 닫기 |
| 파괴적 | `Sam.btn.dangerCombo` | 친구 삭제 · 차단 · 요청 취소(확인 단계) |
| 글자 버튼 | `Sam.btn.ghostCombo` | 목록 안 보조 행동 |

- **두 버튼 배치**: 왼쪽 보조, 오른쪽 주 행동. 높이는 `--overlay-btn-height` 48px.
- **상태 5가지는 모든 CTA 에 필수다.**
  1. **기본**
  2. **눌림**: `--sam-primary-active` 와 `--overlay-press-scale` 0.98
  3. **로딩**: 글자를 그대로 두고 스피너를 붙인다. `disabled` + `aria-busy="true"`, 중복 탭 차단. **`useRef` 만으로 막고 화면에 표시하지 않는 방식은 금지한다**(묶음7 F-5 위반)
  4. **비활성**: `Sam.btn.disabledToken`. 이유를 보조 줄로 표시한다(예: 「보관된 방은 나가기 후 복원할 수 없습니다」, 묶음7 L-9)
  5. **완료**: 버튼 문구가 다음 상태로 바뀌거나, 스낵바를 1회 띄운다
- **파괴적 행동은 확인 팝업을 먼저 띄운다.** 친구 삭제·차단·차단 해제·요청 취소가 해당한다. 묶음3 차단 해제는 현재 확인 없이 바로 실행된다(위반).

### 1-5. 피드백·오류 문구

| 상황 | 표시 | 문구 형식 |
|---|---|---|
| 행동 성공 | 스낵바 1회(2.5초) | 「친구 요청을 보냈습니다.」 |
| 행동 실패(네트워크·서버) | 스낵바 1회 + 버튼 원상복귀 | **무엇이 안 됐는지 + 다음 행동**: 「친구 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.」 |
| 입력·폼 오류 | 입력 아래 오류 줄(`--sam-danger`) | 「@아이디를 찾을 수 없습니다.」 |
| 화면 전체 실패 | 빈 화면 안내 + 「다시 시도」 버튼 | 「목록을 불러오지 못했습니다.」 |

- 오류 영역과 스낵바를 같은 사건에 동시에 쓰지 않는다. 묶음7 L-10 의 8초 자동 삭제 오류 영역은 스낵바로 통일한다.
- 띄어쓰기: 「통화 중」(「통화중」 금지). 사용자 본인을 3인칭으로 부르지 않는다(「발신자 통화 중」 → 「지금 다른 통화 중입니다」).
- 서버 오류 원문(SQL 메시지·코드)을 화면에 보여 주지 않는다.
- 브랜드 표기는 「**DIBAY**」 하나로 쓴다(「DiBay」 금지).

### 1-6. 접근성

- 다이얼로그는 제목·본문에 `aria-labelledby`·`aria-describedby` 를 붙인다(DibayDialog 기본 제공).
- 꾸밈용 로고는 `alt=""` 로 둔다.
- 터치 영역은 최소 44px 이다.
- 닫힌 스와이프 버튼은 `inert` 로 둔다(묶음7 L-11 유지).

---

## 2. 화면별 대조 (묶음 1~7 · 통화 안내 · 친구)

`CLOSED` 기능 동작은 유지한다. 아래 「변경」은 **보이는 모양·문구·상태 표시만** 바꾼다. 기능 동작이 바뀌는 항목은 「기능」으로 따로 표시한다.

| 묶음/ID | 화면·CTA | 공통 기준 위반 | 2단계 처리 | 기능 변경 |
|---|---|---|---|---|
| 묶음1 M-1·3·8 | 전송 실패 시 입력 복원 | 실패했다는 표시가 없음(§1-5) | 스낵바 「메시지를 보내지 못했습니다. 다시 시도해 주세요.」 | 없음 |
| 묶음2 D-1·A-1 | 서버만 변경 | — | 없음 | 없음 |
| 묶음3 F-1~7 | 차단 확인 팝업, 차단 해제 | 차단 중 로딩 표시 없음(팝업이 먼저 닫힘), 해제 확인·결과 안내 없음 | 확인 팝업이 끝날 때까지 로딩 상태 유지, 해제 확인 팝업 + 결과 스낵바 | 해제 확인 단계 추가(동작 순서 변경) |
| 묶음4 K-1~4 | 입력창 | `rounded-[18px]`, hex 4종, 배달 토큰, 뷰포트 문서 §7 이력 누락 | `--messenger-*`·4px 로 치환하고 §7 이력 기록 | 없음(높이·Enter 동작 유지) |
| 묶음5 L-1~7 | 스와이프 나가기 숨김, 주문 확인 문구 | 숨긴 이유를 알려 주지 않음 | 방장·사장님 행에 보조 줄로 사유 표시 | 없음 |
| 묶음6 친구 | §3 전체 | 오버레이 반경 4px, 비 Sam 버튼, 아바타 누락, 상태 누락 | §3·§4 | **있음**(§4) |
| 묶음7 L-4·5 | 열린 스와이프 자동 닫힘 5초 | 근거 없는 값 | 5초를 없애고 스크롤·바깥 탭으로만 닫음 | 미반영 브랜치라 해당 없음 |
| 묶음7 L-9 | 보관 「복원」 비활성 | 사유 없음 | 보조 줄로 사유 표시 | 없음 |
| 묶음7 L-10 | 오류 8초 자동 삭제 | 피드백 방식 이원화 | 스낵바로 통일 | 없음 |
| 묶음7 F-5 | 방 안 친구 요청 | 로딩·비활성 표시 없음 | §1-4 로딩 상태 적용, §3 상태별 버튼 | §4 F-4 와 같음 |
| 묶음7 F-8 | 실패 스낵바 | 문구 형식 불일치 | §1-5 형식 | 없음 |
| 묶음7 K-7 | 멘션 목록 | 새 hex #006241 | `--sam-primary` | 없음 |
| 통화 E-C3 (웹) | 종료 안내 중앙 팝업 | 오버레이 녹색·빨강, 로고 10px, `alt="DIBAY"` | W-0 토큰 통일로 해결, 로고 alt 정리 | 없음 |
| 통화 E-C1·무응답 (웹) | 안내 문구 | 제목·본문 반복, 「통화중」, 3인칭, 마침표 | §1-5 문구표(§5 W-6) | 없음 |
| 통화 안내 (iOS·Android 네이티브) | 상단 색 배너 / 오버레이 | 웹과 모양이 다름 | **네이티브 별도 승인(§6 N-2)** | — |
| 통화 수신 (Android) | 헤드업·잠금 수신 화면 | CallKit 과 다름, 「DiBay」 | **네이티브 별도 승인(§6 N-1)** | — |

---

## 3. 친구 기능 전체 흐름 (화면별 상태·CTA·동작)

**관계 상태** (서버 `messenger-friend-add-cta` 판정 기준)

| 상태 | 뜻 |
|---|---|
| `none` | 관계 없음 |
| `pending_outgoing` | 내가 요청을 보냄 |
| `pending_incoming` | 상대가 나에게 요청함 |
| `friend` | 양쪽 친구 |
| `blocked` | 차단 |
| `self` | 나 자신 |

**흐름**: ① 찾기 → ② 신청 → ③ 상대 전역 중앙 팝업 → ④ 수락·거절 → ⑤ 양쪽 등록 → ⑥ 수락 알림 → ⑦ 친구 삭제

### 3-1. 상태별 CTA (모든 화면 공통)

| 상태 | 주 CTA | 보조 CTA | 누르면 |
|---|---|---|---|
| `none` | **친구 요청** | 메시지 | 요청 전송 → 상태 `pending_outgoing`, 스낵바 「친구 요청을 보냈습니다.」 |
| `pending_outgoing` | **요청됨**(비활성 표시 아님. 회색 보조 버튼) | 요청 취소 | 요청 취소 → 확인 팝업 「친구 요청을 취소할까요?」 → `none` |
| `pending_incoming` | **수락** | 거절 | 수락 → `friend`, 스낵바 「친구가 되었습니다.」 / 거절 → `none`(조용히, 상대에게 알리지 않음) |
| `friend` | **메시지** | 통화 · 더보기(친구 삭제) | 친구 삭제 → 위험 확인 팝업 → 양쪽 `none` |
| `blocked` | (버튼 없음) | 차단 해제 | 해제 확인 팝업 → `none` |
| `self` | (버튼 없음) | — | — |

- 서버 응답이 `incoming_request_exists` 이면 「상대가 이미 친구 요청을 보냈습니다.」를 띄우고 버튼을 **수락**으로 바꾼다.
- 서버 응답이 `already_requested` 이면 상태를 `pending_outgoing` 으로 맞추고 오류로 취급하지 않는다.

### 3-2. 화면별

| # | 화면 | 지금 | 2단계 목표 |
|---|---|---|---|
| ① | 친구 추가 시트 → 검색 결과 행 (`MessengerFriendAddSheet`) | 행을 누르면 **바로 1:1 채팅**. 신청 버튼 없음 | 행 오른쪽에 §3-1 상태 버튼. 행 본문을 누르면 **프로필 시트**. 「메시지」는 보조 버튼 |
| ①' | 검색 키 | @아이디·닉네임(전화번호 탭은 안내 문구만) | 유지. 전화번호 검색은 개인정보·DB 정책이 필요해 범위 밖이다(대장 등록) |
| ② | 프로필 시트 (`MessengerFriendProfileSheet`) | 요청 중·받은 요청이 **텍스트만** | §3-1 버튼 전부 |
| ② | 1:1 방 ⋯ 메뉴 (`CommunityMessengerRoomPhase2OneToOneDotMenu`) | 요청 상태를 몰라 계속 「친구 요청」 | 상태를 받아 §3-1 대로 표시 |
| ② | 방 안 안내 (`CommunityMessengerRoomPhase2PeerNotice`, 묶음7 F-5) | 로딩 표시 없음 | §1-4 로딩 + §3-1 |
| ③ | 전역 중앙 팝업 (`GlobalIncomingFriendRequestHost` → `MessengerIncomingFriendRequestPopup`) | 팝업 데이터는 **메신저 홈에서만** 들어옴. 다른 탭에서는 안 뜸. 아바타 기본 이미지 | 전역 구독으로 **모든 탭**(통화 화면 제외)에서 팝업. 아바타·이름·@아이디 표시. DibayDialog(16px, 버튼 12px, 거절 왼쪽·수락 오른쪽) |
| ③ | 팝업 실패 처리 | 실패해도 조용히 닫히고 다시 안 뜸 | 실패 스낵바, 팝업 유지(재시도 가능), dismissed 로 기록하지 않음 |
| ③ | 앱이 꺼졌거나 뒤에 있을 때 | 알림 없음 | 푸시·알림함 「○○님이 친구 요청을 보냈습니다.」 → 누르면 받은 요청 화면 |
| ④ | 받은 요청 시트 (`MessengerReceivedFriendRequestsSheet`) | 아바타·@아이디 없음 | 아바타·@아이디, 행마다 거절·수락 |
| ④' | **보낸 요청 목록** | **없음** | 같은 시트에 「받은 요청 / 보낸 요청」 탭. 보낸 요청 행에 「요청 취소」 |
| ⑤ | 친구 탭 (`MessengerFriendsScreen`) | 「받은 요청」 진입 행만 | 「친구 요청 (받은 n · 보낸 m)」 진입 행. 수락 즉시 양쪽 목록 실시간 반영 |
| ⑥ | 수락 알림(요청한 사람) | **없음** | 앱 안이면 스낵바 「○○님이 친구 요청을 수락했습니다.」, 앱 밖이면 푸시·알림함 |
| ⑦ | 친구 삭제 | **내 쪽 행만 삭제**(`social-relations.ts:610-615`) → 상대 화면에는 여전히 친구 | **양쪽 행을 한 번에 삭제**. 상대 화면도 실시간으로 `none` 이 된다. 상대에게 알림은 보내지 않는다 |

### 3-3. 그대로 두는 것 (CLOSED·정상 기능)

- 요청 전송·수락·거절·취소 DB 함수(`cm_send/accept/reject/cancel_friend_request`, 운영 적용됨)의 동작
- 차단 시 친구 정리(묶음3), 차단 상대 요청 거부
- 검색 API(@아이디·닉네임)
- 친구 목록 정렬·즐겨찾기·숨김
- 1:1 채팅 시작 경로(보조 버튼으로 남김)
- 친구 목록의 기준 데이터: `user_social_relations.friend`. 양쪽 행이 있어야 「친구」이고, `community_messenger_friendships` 는 보관·호환용이다

---

## 4. 묶음6 누락 기능 목록 (빠짐없이)

| ID | 누락 | 종류 | 처리 위치 |
|---|---|---|---|
| F-1 | 검색 결과 행 친구 신청 버튼 · 행 탭 → 프로필 | 웹 | 2단계 |
| F-2 | 요청 취소 버튼(프로필·방 메뉴·보낸 요청 목록) + 확인 팝업 | 웹 | 2단계 |
| F-3 | 수락·거절 버튼(프로필·방 메뉴·받은 요청 시트) | 웹 | 2단계 |
| F-4 | 방 메뉴·방 안 안내의 요청 상태 반영 | 웹 | 2단계 |
| F-5 | 보낸 요청 목록(탭) | 웹 | 2단계 |
| F-6 | **전역 팝업**: 모든 탭에서 구독해 팝업을 띄움, 아바타 표시, 실패 처리 | 웹 | 2단계 |
| F-7 | 수락 알림(앱 안 스낵바 · 앱 밖 푸시·알림함) | 웹 서버 | 2단계 (기존 알림 종류 값만 사용 — §5 확인 항목) |
| F-8 | 오프라인 수신자 요청 푸시·알림함 | 웹 서버 | 2단계 (F-7 과 같은 경로) |
| F-9 | **친구 삭제 양쪽 처리** + 상대 실시간 반영 | 웹 서버 | 2단계 (기존 테이블 삭제 1문장, DB 구조 변경 없음) |
| F-10 | `incoming_request_exists` → 수락 유도, `already_requested` 정상 처리 | 웹 | 2단계 |
| F-11 | 디자인 기준(§1) 적용: 오버레이 반경, Sam 버튼, 상태 5가지 | 웹 | 2단계 |
| F-12 | DB 함수 보완: 친구 검사 `is_active`, 동시 요청 잠금, 오류 원문 노출 제거, 거절 뒤 재요청 간격, 클라이언트 status 직접 수정(RLS) 차단 | **DB** | **운영 DB 변경 → Owner 별도 승인**(2단계와 분리) |
| F-13 | 예전 단방향 친구(한쪽만 「친구」) | 데이터 | **데이터 변경 없이 유지**한다. 상대가 요청하면 기존 함수로 양쪽이 된다. 대장에 기록 |
| F-14 | 전화번호로 친구 찾기 | 정책 | 범위 밖. 대장에 기록 |

---

## 5. 2단계 — 웹 수정 대상 파일·기능·영향 (승인 후)

커밋 단위는 **한 묶음 = 한 커밋**이다. 통화 코드는 통화 규정에 따라 **단독 커밋**으로 한다.

| ID | 파일 | 바꾸는 것 | 영향 범위 | 회귀 확인 |
|---|---|---|---|---|
| **W-0** 공통 토큰 | `app/dibay-overlay.css` | `--overlay-primary`·`-dark`·`danger`·`text-*`·`border` 를 `--sam-*` 참조로 변경 | **앱 전체 중앙 팝업·바텀시트**(매장·주문·관리자·로그인 포함)의 녹색·빨강·글자색이 앱 토큰과 같아짐. 레이아웃·크기 변화 없음 | `design-system-hard-lock` 테스트, 대표 팝업 5곳 화면 대조 |
| **W-1** 친구 CTA | `lib/community-messenger/messenger-friend-add-cta.ts` · `lib/i18n/catalog/cm-friend-add-cta-labels.ts` | §3-1 상태별 주·보조 CTA 정의, 문구 | 프로필·검색·방 메뉴가 같은 정의를 씀 | `messenger-friend-add-cta.test.ts` |
| **W-2** 검색 결과 | `components/community-messenger/MessengerFriendAddSheet.tsx` | 행 상태 버튼, 행 탭 → 프로필, 시트 반경 24px | 친구 추가 시트만 | 검색·채팅 시작 경로 유지 |
| **W-3** 프로필·방 | `MessengerFriendProfileSheet.tsx` · `room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx` · `room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx` | 취소·수락·거절 버튼, 요청 상태 전달, 로딩 표시 | 1:1 방 메뉴(통화 버튼은 건드리지 않음) | 방 메뉴 다른 항목 유지 |
| **W-4** 요청 목록 | `MessengerReceivedFriendRequestsSheet.tsx` · `MessengerFriendsScreen.tsx` | 받은/보낸 탭, 아바타·@아이디, 진입 행 | 친구 탭 | 친구 목록 정렬 유지 |
| **W-5** 전역 팝업 | `GlobalIncomingFriendRequestHost.tsx` · `MessengerIncomingFriendRequestPopup.tsx` · `lib/community-messenger/stores/incoming-friend-request-popup-store.ts` · `lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts`(친구 요청 구독 분리) · `CommunityMessengerHome.tsx`(store 적재 이관) | 전역 구독·적재, DibayDialog, 실패 처리 | 모든 탭의 Realtime 구독 1개 추가(사용자당 1채널, 홈 채널의 친구 요청 구독은 옮김). **통화 화면에서는 띄우지 않는 기존 규칙 유지** | Realtime 채널 수, 홈 bootstrap 재요청 횟수 |
| **W-6** 서버 | `lib/community-messenger/service.ts`(요청·수락 뒤 알림, 삭제) · `lib/community-messenger/social-relations.ts`(양쪽 삭제) | 수락·요청 알림 `appendUserNotification`, 친구 삭제를 양쪽 1문장으로 | 친구 API 응답 형식 유지 | 친구 삭제 후 즐겨찾기·숨김 정리 유지 |
| **W-7** 메신저 공통 정리 | 묶음1 입력 실패 스낵바 · 묶음3 차단 로딩·해제 확인 · 묶음4 입력창 토큰(`line-ui/messenger-composer-sector.tsx`) + `docs/community-messenger-mobile-room-viewport.md` §7 · 묶음5 사유 표시 | §2 표 | 입력창 모양만(높이·Enter·키보드 동작 불변) | 뷰포트 계약 테스트 |
| **W-8** 묶음7 | 브랜치 `8d9b4c7cb` 에 §2 의 L-4·5·9·10, F-5·8, K-7 보정 후 main 반영 | §2 표 | 묶음7 범위 | 묶음7 vitest |
| **W-9** 통화 안내 문구 (**통화 규정 적용**) | `lib/community-messenger/call-ui/call-in-app-notice-center-copy.ts` · `components/messenger/call/CallInAppNoticeCenterDialog.tsx`(로고 alt) | 제목·본문 반복 제거, 「통화 중」, 마침표, 3인칭 제거 | **문구만.** 표시 시점·종류·발송·상태 전이는 바꾸지 않음. 웹 통화 코드라 단독 커밋 + Cursor 실기기 | `call-in-app-notice-center-copy.test.ts` |

**2단계 시작 전 읽기 전용 확인 (DB 변경 없음)**

| 확인 | 목적 |
|---|---|
| `notifications.notification_type` 제약 | F-7·F-8 에 기존 값(`system`/`chat`)과 `meta.kind=friend_request/friend_accepted` 만으로 충분한지. 부족하면 W-6 알림을 빼고 DB 승인 항목으로 옮긴다 |
| `user_social_relations` 삭제 권한 | W-6 양쪽 삭제가 service_role 로 가능한지 |

**2단계에서 하지 않는 것**
- 운영 DB 함수·RLS·데이터 변경(F-12)
- 네이티브 파일
- 통화 동작
- 전화번호 검색
- 친구 기능 밖의 새 기능

---

## 6. 네이티브 별도 승인 항목 (Claude 수정 안 함 · Owner 승인 대기)

| ID | 수정 목적 | 수정 내용 | 예상 결과 | 다른 기능 영향 |
|---|---|---|---|---|
| **N-1** Android 수신 화면 (§4-11 4번) | iPhone CallKit 과 같은 수신 경험 | `NativeVoiceCallNotification` 헤드업을 `NotificationCompat.CallStyle.forIncomingCall` 로 바꿈(거절 왼쪽·수락 오른쪽 원형, 발신자 `Person`). 잠금 화면 `IncomingCallActivity`·`NativeVoiceCallActivity` 를 CallKit 배치로(위 작은 로고+「DIBAY 음성 통화」 → 이름 → 아래 원형 거절·수락, 어두운 무채색). `IncomingCallUiCopy`·`strings.xml` 의 「DiBay」 → 「DIBAY」 | Samsung 수신 화면이 iPhone 과 같은 순서·모양 | **수락·거절 PendingIntent 경로는 그대로.** 영향 경로: 헤드업 표시(Android 12+ CallStyle 은 foreground service·full-screen intent 권한 필요), 잠금 화면 표시, 벨 중 취소 시 알림 제거, 무응답 타임아웃. Android `versionCode` 증가·APK 재설치 필요 |
| **N-2** 통화 안내 네이티브 표시 | 웹 중앙 팝업과 같은 모양 | iOS `NativeCallInAppNotice.swift` 상단 색 배너, Android `NativeCallInAppNoticeOverlay.java` 를 웹 E-C3 와 같은 중앙 카드(16px, 녹색 #0B421A 확인 버튼, 문구는 W-9 와 같음)로 | 통화 종료 안내가 3개 환경에서 같음 | 통화 종료 직후 화면 전환·CallKit 종료와 겹치는 시점. 안내가 남아 다음 수신을 가리지 않는지 확인 필요. iOS·Android 각각 빌드 |
| **N-3** `bcad9b4b7` 회귀 확인 (코드 변경 없음) | main 에 있는 Android 발신 실패 처리 변경이 정상 통화를 깨지 않는지 | 수정 없음. Cursor 실기기 검증만 | 다음 APK 빌드 전 PASS 확보 | 확인 전 Android 설치·출시 빌드 금지 |

- 각 항목은 통화 변경 규정 3번 형식(파일·함수, 영향 경로, 설치된 구 바이너리 호환, 회귀 위험, 롤백, 실기기 항목)으로 상세 문서를 쓰고, 승인 후 Cursor 가 구현·빌드·실기기를 한다.

---

## 7. Cursor 실기기 검증 절차 · PASS/FAIL 기준

**공통**
- 기기: Samsung(q테스트1) ↔ iPhone(w테스트1)
- 매 시험 전 Production SHA 를 확인한다. 운영 DB 는 읽기만 하고, `dibay-test` 는 쓰지 않는다.
- 시각은 PHT 로 기록한다.
- 화면 캡처를 남긴다.
- FAIL 이면 즉시 멈추고 보고한다.

### 7-1. 친구 (2단계 W-1~W-6 반영 후)

| # | 시험 | PASS 기준 |
|---|---|---|
| FR-1 | A 가 B 를 @아이디로 검색 | 결과 행에 「친구 요청」 버튼. 행을 누르면 프로필 |
| FR-2 | A 요청 전송 | A 버튼 「요청됨」 + 취소. 스낵바 1회. DB `community_friend_requests` pending 1행 |
| FR-3 | B 가 **마켓 탭·채팅방·메신저 홈** 각각에 있을 때 FR-2 | 3곳 모두 **3초 안에** 중앙 팝업(아바타·이름·@아이디, 거절 왼쪽·수락 오른쪽). 통화 화면에서는 뜨지 않음 |
| FR-4 | B 앱 종료 상태에서 FR-2 | 푸시·알림함 1건. 누르면 받은 요청 화면 |
| FR-5 | B 수락 | 양쪽 친구 목록에 실시간 등장(새로고침 없이). A 에 「수락했습니다」 스낵바(앱 밖이면 푸시). DB 양방향 `friend` 2행 |
| FR-6 | B 거절 | B 팝업 닫힘, A 상태 `none` 복귀, A 에게 알림 없음 |
| FR-7 | A 요청 취소(보낸 요청 탭) | 확인 팝업 → 취소. B 받은 요청에서 실시간으로 사라짐 |
| FR-8 | 서로 동시에 요청 | 한쪽은 「상대가 이미 요청함 → 수락」 안내 |
| FR-9 | A 친구 삭제 | 위험 확인 팝업 → 삭제. **B 화면에서도 실시간으로 친구 아님.** DB `friend` 0행 |
| FR-10 | 삭제 뒤 재요청 → 수락 | 정상 |
| FR-11 | 네트워크 끊고 요청·수락 | 실패 스낵바, 버튼 원상복귀, 팝업 유지 |
| FR-12 | 차단 상대 검색·요청 | 요청 버튼 없음 또는 거부 안내. 서버 원문 노출 없음 |

### 7-2. 디자인 기준 (W-0·W-7·W-8 반영 후)

| # | 확인 | PASS 기준 |
|---|---|---|
| DS-1 | 친구 팝업·받은 요청 시트·친구 추가 시트·차단 확인·통화 종료 안내 | 패널 16px(시트 위 24px), 안 버튼 12px, 주 버튼 녹색 #0B421A, 거절·삭제 빨강 #d45252 |
| DS-2 | 위 화면의 버튼 | 눌림 색 변화, 로딩 스피너 + 중복 탭 안 됨, 비활성 회색(흐림 아님) |
| DS-3 | 문구 | 제목·본문 반복 없음, 「통화 중」, 마침표, 「DIBAY」 |
| DS-4 | 매장·주문·로그인 팝업 각 1개(W-0 영향) | 레이아웃 변화 없음, 녹색이 앱과 같음 |

### 7-3. 통화 안내 문구 (W-9 · 통화 규정)

- 다음 각 1회: S↔I 무응답 · 거절 · 통화 중 · 정상 종료.
- PASS 기준
  - 안내 시점·종류가 변경 전과 같다(문구만 다름).
  - 벨·CallKit·종료가 정상이다.
  - callId 별로 세션·발송 시각을 운영 DB 와 대조해 일치한다.

---

## 8. 기존 계획 대비 현황 (완료·미완료·보류)

| 구분 | 항목 |
|---|---|
| **완료(CLOSED·PASS)** | 통화 A1·A2·A3·A4·A5·A6·A7 · F1·F2 · DB 부하 수정 · B·C·D(SIDE-06) · E-C1 · 발신자 무응답 안내 · E-C2-A · E-C3(웹, 디자인 정리는 W-0·W-9) · SIDE-06·08 · 묶음1~5(기능. 디자인 정리는 W-7) |
| **미완료** | 묶음6 친구(F-1~F-11) · 묶음7(브랜치, W-8) · 디자인 공통 정리(W-0·W-7) · 통화 안내 문구(W-9) · 단계 F 전체 회귀 |
| **네이티브 승인 대기** | N-1 Android 수신 화면 · N-2 통화 안내 네이티브 · N-3 `bcad9b4b7` 회귀 확인 |
| **DB 승인 대기** | F-12 친구 DB 함수 보완 |
| **잔여(증거 먼저 · 임의 구현 금지)** | **A1b** 늦은 링 · **L-CALL** · **L-ARCH** · **N-SOUND** · SIDE-01·03·05·07·09 · F-13 단방향 친구 · F-14 전화번호 검색 |
| **보류 유지** | E-C2-C·E-C2-D · SIDE-02·04 · M-10·11·14·15 · E-C2-B 릴리스 |
| **규정 위반 기록** | 묶음6 T1~T7·묶음7 검증의 `dibay-test` 사용. 재사용하지 않으며, 친구 검증은 §7-1 운영 실기기로 다시 한다 |

**2단계 진행 순서 (제안)**
1. W-0 → W-1~W-6(친구) → Cursor FR-1~12
2. W-7·W-8 → Cursor DS-1~4
3. W-9(통화 규정, 단독) → Cursor 7-3
4. N-1·N-2·N-3·F-12 는 각각 별도 승인

---

## 9. 2단계 구현 결과 (2026-10-24 · Claude · Owner 「수정 방향대로 진행」 지시)

[배포 구분] 웹만 — 앱 재시작만 하면 반영. 네이티브·운영 DB 변경 없음.

| 커밋 (main) | 내용 | 로컬 검증 |
|---|---|---|
| `457a969c2` | W-0 오버레이 색을 앱 토큰으로 | PASS (→ `5e2b09b52` 에서 다크 대응으로 재수정) |
| `0b3dd1bd2` | 친구 F-1~F-11 (검색 신청·요청 취소·수락·보낸 요청·전역 팝업·수락/요청 알림·양쪽 삭제) | typecheck · vitest(신규 계약 8) · eslint 0 error |
| `d30103c63` | W-7 입력창·첨부·차단 확인 토큰/상태 | PASS |
| `6eaf9d82e` | W-8 묶음7 Wave A–C + 보정(5초 닫힘 제거·복원 사유·오류 스낵바·멘션 색) | PASS |
| `5e2b09b52` | **회귀 수정**: W-0 이 OS 다크 설정 기기에서 팝업 글자를 흰 배경에 묻히게 함(`--sam-*` 가 다크에서 바뀜) → 밝은 화면 고정 토큰 | PASS · 계약 테스트로 `--sam-*` 금지 |
| `d372be961` | W-9 통화 안내 문구·색 (통화 단독 커밋) | 통화 관련 vitest 467 PASS · 문구 판정 잠금 테스트 추가 |

- 전체 vitest 실패는 기존 7파일 32건(이미지 자동 저장·로그인 마커·장바구니·마이페이지·설정)과 같다. 이번 변경과 무관하다.
- **회귀 노출 구간**: `6eaf9d82e` → `5e2b09b52` 반영 사이(수 분). 다크 모드 기기에서 팝업 제목이 안 보였을 수 있다.

**계획 대비 하지 않은 것 (사유)**
- 묶음1 전송 실패 스낵바: 이미 실패 말풍선에 「전송 실패 · 재전송 · 삭제」가 있어 중복이다. 변경하지 않았다.
- 묶음5 나가기 숨김 사유 표시: 78px 스와이프 버튼 영역에 문구를 넣을 공간이 없다. 서버 거부 안내로 충분하다. 미실시.
- 차단 해제 확인 팝업: 묶음3 F-7(「차단만 확인」, CLOSED·재개봉 금지)을 유지했다. 해제 후 결과 안내만 정리했다.
- F-12 친구 DB 함수 보완, N-1~N-3 네이티브: 별도 승인 대기.

**실기기**: NOT_PROVEN — Cursor 지시서 `docs/audit/cursor-prompt-stage2-device-verify-2026-10-24.md`.

---

## 10. 실기기 1차 결과와 결함 기록 (2026-10-25 · Claude 직접 · Samsung↔iPhone · Production `d372be961`)

| # | 결함 | 증거 | 원인 (코드) | 조치 |
|---|---|---|---|---|
| D-1 | 백그라운드 중 도착한 친구 요청이 앱 복귀 후 중앙 팝업으로 안 뜸 | 요청 `9e658188` 13:27:00. iPhone 복귀 후 미표시, 완전 종료 후 재실행하니 표시 | `use-global-friend-request-feed` 가 마운트 시 1회만 목록을 조회. Realtime 은 놓친 INSERT 를 다시 보내지 않음 | `abc8a3eac`: visible·focus·채널 (재)연결 시 재조회 |
| D-2 | 메신저 밖(커뮤니티 탭)에서 팝업 수락 후 안내 없음 | 수락 13:31:05 DB 반영, iPhone 화면에 안내 없음(Owner) | 스낵바 호스트가 `/community-messenger` 레이아웃에만 있음 | `abc8a3eac`: 전역 Host 가 메신저 밖에서 스낵바 호스트 장착 |
| D-3 | 친구 탭 「@아이디」 검색 결과에 친구 버튼 없음, 누르면 바로 채팅 | Samsung 캡처 `03-S-search.png`·`04-S-searchtap.png` | 인라인 검색(`MessengerHomeInlineFriendSearch`)이 2단계 범위에서 빠짐 | `abc8a3eac`: 친구 추가 시트와 같은 결과 행 공용 |
| D-4 | 친구 요청 알림 본문 「회원님이 친구 요청을 보냈습니다.」 | `notification_events` `3b414144` | 보낸 사람 시점 목록의 본인 라벨 사용 | `abc8a3eac`: 받는 사람 시점 이름 |
| D-5 | 친구 탭 상단 「친구 요청」·「친구 관리」가 글자 행 2개로 목록 공간을 차지 (Owner 지적) | Samsung 캡처 `02-S-friends.png` | 디자인 미검토 | **§11 설계 → 승인 후 구현** |
| 관찰 | 요청 직후 Samsung 「보낸 0」 | 이동 2초 뒤 캡처 | 갱신 전 캡처 가능성 → 재시험에서 확인 | NOT_PROVEN |

PASS: 방 안 친구 추가(요청만, 친구 표시 안 됨) · 앱 밖 푸시 발송(APNs 200, 1초) · 수락 시 양쪽 friend 행 활성 · Samsung 목록 실시간 반영 · 수락 알림 이름(「w테스트1님이…」).

## 11. 친구 탭 상단 재설계 (D-5 · Owner 승인 전 구현 금지)

**목표**: 글자 행 2개를 없애고, 받은 요청이 있을 때만 한눈에 보이게 한다. 목록이 화면 위쪽부터 바로 보인다.

| 영역 | 현재 | 변경 |
|---|---|---|
| 검색 줄 | 검색창만 | 검색창 오른쪽에 아이콘 버튼 2개(각 44px 터치 영역, `aria-label`) |
| 친구 요청 | 전체 폭 글자 행 「친구 요청 · 받은 n · 보낸 m」 | **사람+ 아이콘**. 받은 요청 수 배지(빨강 원형 숫자, 0 이면 숨김). 누르면 친구 요청 시트(받은/보낸 탭) |
| 친구 관리 | 전체 폭 글자 행 + 숨김·차단·알림 끔 수 | **조절 아이콘**. 숨김·차단·알림 끔이 1개 이상이면 작은 점 표시. 누르면 기존 친구 관리 시트 |
| 받은 요청 안내 | 없음 | **받은 요청이 있을 때만** 검색 줄 아래 카드 1개: 겹친 아바타(최대 3) + 「받은 친구 요청 n」 + 「○○ 외 n명」 + 「확인」 버튼 → 시트(받은 탭). 0건이면 카드 없음(공간 0) |
| 내 프로필 줄 | 유지 | 유지 |
| 친구 목록 제목 | 「친구」 | 「친구 n」 |

- 색: 브랜드 녹색 고정 토큰(`--dibay-green`·`--sm-color-primary-soft`), 배지 `--sm-color-danger`. 다크 설정에서도 글자가 보이는 조합(§1-1).
- 모서리: 아이콘 버튼·카드 4px(화면에 붙은 요소, §1-3).
- 수정 파일: `MessengerFriendsScreen.tsx`(상단 2행 제거·카드), `MessengerHomeMainSections.tsx`(검색 줄 아이콘 버튼 · 친구 탭에서만), 문구 사전. 시트·API·DB 는 변경 없음.
- 바뀌지 않는 것: 친구 목록 정렬·즐겨찾기·숨김, 시트 동작, 다른 탭(통화·대화·보관함) 상단.

**검증 (실기기, Claude 직접)**: 받은 요청 0건 / 1건 / 2건 이상 · 보낸 요청만 있음 · 숨김·차단 있음 각 화면 캡처, 아이콘 → 시트 열림, 다크 설정 글자 확인, D-1~D-4 재시험.

## 12. 실기기 2차 결과 (2026-10-25 · Claude 직접 · Samsung(q테스트1)↔iPhone(w테스트1) · Production `7cf8da08a`)

| # | 결함 | 증거 | 원인 (코드) | 조치 |
|---|---|---|---|---|
| D-6 | 채팅 목록 행 주황색 띠 | Owner 지적 | 미특정 | **OPEN** — DOM 증거 수집 전 수정 안 함 |
| D-7 | 검색 결과 친구 여부 오래된 값 | Samsung 캡처 | 검색이 홈 친구 목록과 분리 | `69a5de1e7`: 컨텍스트 `friendIds` |
| D-8 | 수신 팝업에 X 없음, 바깥 탭으로만 닫힘 | Owner | 닫기 버튼 미구현 | `12348847c` |
| D-9 | 보낸 요청이 첫 화면에 안 보임 | Owner | 보낸 요청 카드 없음 | `12348847c`: `variant="sent"` 카드 |
| D-10 | 검색 패널 바깥 클릭 처리가 확인 팝업을 닫음 | Samsung | 오버레이 영역 미제외 | `12348847c` |
| D-11 | 취소한 보낸 요청이 남음 | Samsung | 오래된 보낸 요청을 무기한 유지 | `12348847c`: 30초 한정 |
| D-12 | 세션 캐시 복원 시 요청 목록 오래된 값 | Samsung | P-3 재조회 생략 · 피드 결과 홈 미전달 | `d162d78f2` |
| D-13 | iPhone 실시간 팝업 미표시 (모든 시도 FAIL) | Samsung WebView WS 기록 `ws-samsung.log`: phx_join 거절 `PrivateOnly` | Realtime 이 비공개 채널만 허용하는데 피드가 공개 채널·허용 안 된 토픽으로 구독 | `ee9f13984`·`7cf8da08a`: `subscribeWithRetry` + 비공개 채널 + 허용 토픽 `cm-room-friendship:<uid>:…` |
| D-14 | 방 친구 상태 동기화 채널 토픽 미허용 (D-13 과 같은 원인) | 코드 대조 | `cm-room-social-relation:` 토픽 | `7cf8da08a`: `cm-room-friendship:<viewer>:<peer>` |

**`7cf8da08a` 실기기 PASS**
- 실시간 구독: Samsung phx_join `status: ok` + `Subscribed to PostgreSQL` (15:23:17 PHT, `ws-samsung4.log`).
- 실시간 팝업(D-13): iPhone 앱 실행 중 요청 생성 15:26:39 → 팝업 표시. X 버튼·@qqqq 확인(D-8).
- 거절(FR-6): responded 15:27:34 `rejected` → Samsung 검색 결과 「요청 취소」→「친구 요청」 자동 전환.
- 앱 복귀 팝업(D-1): iPhone 백그라운드 중 요청 15:28:30 → 복귀 시 팝업.
- 수락: responded 15:29:06 `accepted` → Samsung 「새 친구 1 · w테스트1」, 검색 결과 「친구 · 메시지」 실시간 반영.
- 보낸 요청 취소(D-9·D-11): 카드 → 시트 → 요청 취소 → 즉시 「보낸 요청이 없습니다」.

**NOT_PROVEN (미시험)**: D-2 메신저 밖 수락 스낵바 · FR-8 동시 요청 · FR-11 네트워크 끊김 · FR-12 방 메뉴 취소·수락(D-14 실기기) · DS-5 다크 모드 · W-9 통화 안내 C-1~C-5 · D-6.

## 13. 메신저 홈 UI 통일 설계 (친구·대화·통화·보관함 · 2026-10-25 · Owner 승인 전 구현 금지)

Owner 지시 (15:31 PHT): 다크 모드는 대상 아님(승인 불가). 보낸 요청 카드·내 프로필·검색 드롭다운이 친구 목록과 구분 안 됨. 모달이 글자 나열형이고 탭마다 양식이 다름 → 전체 UI 를 하나의 양식으로.

### 13-1. 실측 결함 (Samsung 캡처 `tmp/verify-2026-10-25-stage2-claude/ui-*.png`, `43-S`·`44-S`·`47-S`·`59-S`)

| # | 화면 | 결함 | 증거 |
|---|---|---|---|
| U-1 | 친구 탭 보낸 요청 카드 | 흰 바탕·회색 테두리 → 친구 행과 같은 모양, 상태가 안 읽힘 | `43-S` |
| U-2 | 내 프로필 카드 | 흰 카드 + 버튼 1개, 친구 행과 위계 차이 약함 | `43-S` |
| U-3 | @검색 드롭다운 | 흰 패널이 흰 목록 위에 겹쳐 경계 약함, 뒤 목록이 그대로 보여 「떠 있는 결과」로 안 읽힘 | `47-S` |
| U-4 | 친구 프로필 시트 | 큰 버튼 3개 세로 + 아이콘 없는 글자 행(즐겨찾기·숨기기·친구 삭제·차단·신고) 나열 | `59-S`, Owner 첨부 |
| U-5 | 시트 머리 | 친구 요청=중앙 팝업+X, 친구 관리=하단 시트+X, 설정=하단 시트+「닫기」 글자, 그룹 생성=하단 시트+작은 ×+제목 중복(「그룹 생성」 2번), 알림=중앙 팝업+X+톱니 | `44-S`·`ui-01`·`ui-08`·`ui-03`·`ui-09` |
| U-6 | 대화 행 길게 누르기 | 아이콘이 오른쪽에 붙은 드롭다운 — 프로필 시트 메뉴와 양식이 다름 | `ui-04` |
| U-7 | 보관함 탭 | 연한 주황 카드 4개 +「…」+「상세 관리로 이동」 글자 — 다른 탭 목록 양식과 다름 | `ui-07` |
| U-8 | 통화 탭 행 | `w테스트1(@wwww)`(띄어쓰기 없음), 큰 초록 원 통화 버튼, 상태 칩 색이 친구·대화 칩과 다름 | `ui-05` |
| U-9 | 통화 탭 행 | 이미 친구인 w테스트1 이 「친구 아님」 표시 (기록 시점 값 고정) | `ui-05` |
| U-10 | 알림 센터 | 친구 수락 알림의 분류가 「거래」 | `ui-09` |
| D-6 | 대화 목록 행 | 오른쪽 14px 주황 띠 | CDP: `app/messenger-presentation.css:78` `[data-messenger-chat-row]{padding-left/right: var(--cm-list-pad-x)}` 가 스와이프 행 바깥 틀(`MessengerChatListItem.tsx:1192`)에도 걸림 → 본문은 14~370px, 스와이프 버튼 띠(`absolute right-0`)는 384px 까지 → 틈으로 「나가기」(`bg-orange-600`) 노출 |
| D-2 | 메신저 밖 팝업 수락 | 수락 후 안내 없음 (iPhone, 15:29:06 수락) | Owner. 원인 추적 중 — Samsung 재현으로 DOM 확인 후 확정 |

### 13-2. 통일 양식 (4종만 사용)

| 양식 | 쓰는 곳 | 모양 |
|---|---|---|
| **S1 하단 시트** | 목록·설정·관리 (친구 요청, 친구 관리, 설정, 그룹 생성, 알림 센터, 대화 필터) | 위 손잡이 · 머리 = 제목 왼쪽 + 오른쪽 X 아이콘 32px (글자 「닫기」 금지) · 본문 · 필요 시 하단 고정 주 버튼. 모서리 위 `--overlay-radius-xl`. 중앙 팝업 금지 |
| **S2 중앙 확인창** | 결정 1개만 (친구 요청 받음, 삭제·차단·요청 취소 확인) | `DibayDialog` — 제목 · 설명 1~2줄 · 버튼 2개(보조 / 주 또는 위험). X 는 결정을 미루는 팝업(친구 요청 받음)만 |
| **S3 행동 메뉴** | 행 길게 누르기, 프로필 하단, 방 메뉴 | 하단 시트 안 묶음 목록: 행 높이 48px · 왼쪽 아이콘 20px + 글자 · 묶음 사이 8px 간격 띠 · 위험 행동(친구 삭제·차단·신고·나가기)은 마지막 묶음, 빨간 아이콘·글자. 아이콘 없는 글자 행 금지 |
| **S4 프로필 시트** | 친구·검색 결과·통화 기록 상대 | 머리(아바타 72 · 이름 · @아이디 · 관계 칩) → 가로 아이콘 버튼 3개(메시지 · 음성 · 영상, 아이콘 위 글자 아래) → S3 메뉴 |

### 13-3. 목록 위 요약 블록 vs 친구 행 (구분 규칙)

- **친구 행**: 바탕 그대로, 테두리 없음, 아래 구분선만.
- **요약 블록**(받은 요청 · 보낸 요청 · 내 프로필): 위에 작은 구역 제목 + `--sam-surface` 카드 + `--overlay-elevation-1` 그림자 + 왼쪽 아이콘 타일 40px. 받은 요청 = 초록 연한 바탕 + 「확인」 주 버튼. 보낸 요청 = 시계 아이콘 타일 + 「수락 대기 n」 상태 칩 + ›. 내 프로필 = 아바타 테두리 링(브랜드) + 「나」 칩 + 「편집」 보조 버튼.
- **@검색 결과**: 패널 열리면 아래 목록을 `--overlay-backdrop` 로 어둡게(탭하면 닫힘) · 패널 `--overlay-radius-md` + `--overlay-elevation-3` · 머리 띠(연한 회색) 「검색 결과 n명」 · 행 = 아바타 · 이름 · @아이디 · 관계 칩 · 상태 버튼.

### 13-4. 탭별 적용

| 탭 | 바꾸는 것 | 파일 |
|---|---|---|
| 친구 | U-1·U-2 요약 블록, U-3 검색, U-4 프로필 S4, 친구 요청 시트 S1 (중앙→하단) | `MessengerReceivedFriendRequestsCard.tsx`, `MessengerFriendsMyProfileStrip.tsx`, `MessengerHomeInlineFriendSearch.tsx`, `MessengerFriendProfileSheet.tsx`, `MessengerFriendRowQuickPopup.tsx`, `MessengerReceivedFriendRequestsSheet.tsx` |
| 대화 | U-6 길게 누르기 → S3, D-6 스와이프 행 여백 | `MessengerChatRoomActionSheet.tsx`, `MessengerChatListItem.tsx`, `app/messenger-presentation.css` |
| 통화 | U-8 행 양식을 친구 행과 같게(이름 + @아이디 · 칩 공용 · 통화 버튼 40px 테두리형), U-9 친구 여부는 현재 친구 목록 기준 | 통화 기록 목록 행 컴포넌트(**웹 표시만** · 통화 발신·세션·푸시 코드 미접촉) |
| 보관함 | U-7 카드 4개 → 목록 행(아이콘 · 이름 · 개수 · ›) | `MessengerArchiveScreen.tsx` |
| 공통 | U-5 시트 머리 공용 컴포넌트 1개, 설정·그룹 생성·알림 센터 적용 | `MessengerSheetUi.tsx`(머리·S3 메뉴 공용 추가), `MessengerSettingsSheet.tsx`, `MessengerNewConversationSheet.tsx`, `MessengerNotificationCenterSheet.tsx`, `MessengerFriendsPrivacySheet.tsx` |
| 알림 | U-10 친구 알림 분류 | 알림 분류 매핑 (확인 후 파일 확정) |

- **바뀌지 않는 것**: API·DB·실시간·통화 동작 · 네이티브 파일 · 방 안 화면(타임라인·입력창) · 다크 모드(대상 아님).
- **통화 규정**: 통화 탭 U-8·U-9 는 목록 표시만 바꾸고 `lib/community-messenger/call*`·`call-v4/**`·통화 화면·푸시는 건드리지 않는다. 통화 단독 커밋 규정 대상이 아님을 diff 로 확인 후 보고.
- **반영 순서**: ① D-6·D-2 결함(원인 확정분) ② 공용 S1~S4 + 친구 탭 ③ 대화·통화·보관함 ④ 알림. 단계마다 Samsung 캡처 전·후 비교 + iPhone 1회 확인.
- **검증**: 각 화면 전·후 캡처 표, 시트 열기·닫기(X·바깥·뒤로), 위험 행동 확인창, 검색 패널 어둡게·닫힘, 스와이프 행 틈 0px(CDP 로 행 본문 폭 = 행 폭).

### 13-5. 구현 (2026-10-25 · Owner 「§13 승인 · 순서대로 구현」)

| # | 수정 | 파일 |
|---|---|---|
| D-6 | 스와이프 대화 행: 여백을 바깥 틀 → 움직이는 본문으로 (`data-cm-swipe-row`·`data-cm-swipe-fg`). Samsung 에서 CSS 주입으로 본문 폭 = 행 폭 384px 확인 | `app/messenger-presentation.css`, `MessengerChatListItem.tsx` |
| U-3 | 검색 카드 자동 접힘(Owner 18:2x 추가 지적): 탭 전환·화면 이동 → 검색어 비움 / 결과 행 탭(프로필·채팅)·뒤로 → 카드 접힘 + 키보드 내림 / 바깥 탭 시 키보드도 내림. 결과가 열리면 뒤 목록 어둡게(탭하면 접힘). 패널 `--overlay-elevation-3`, 머리 띠 회색 | `MessengerHomeInlineFriendSearch.tsx`, `MessengerHomeMainSections.tsx` |
| 공용 | `DibaySheetHeader`(S1) · `DibayMenuList`(S3) · `DibayQuickActions`(S4) 를 Overlay SSOT 에 추가, 메신저 시트 머리 `MessengerSheetHeaderBar` | `components/ui/dibay-overlay/DibaySheetParts.tsx`, `app/dibay-overlay.css`, `MessengerSheetUi.tsx` |
| U-4 | 친구 프로필 시트: X · 아바타 72 · 관계 칩 → 메시지(주)·음성·영상 가로 버튼 → 아이콘 메뉴 2묶음(위험 행동 마지막). 「닫기」 글자 버튼 제거. 통화 시작 함수는 그대로(호출만) | `MessengerFriendProfileSheet.tsx` |
| U-4 | 친구 행 빠른 메뉴: 중앙 팝업 → 하단 시트(S1+S4+S3), 쓰지 않던 「통화」 단계 제거 | `MessengerFriendRowQuickPopup.tsx` |
| U-1·U-2 | 「친구 요청」 구역 제목 + 받은 요청(초록 · 아이콘 타일 · 확인) / 보낸 요청(시계 타일 · 「수락 대기 n」 칩 · ›), 카드 그림자. 내 프로필: 그림자 · 브랜드 링 · 「프로필 편집」 보조 버튼 | `MessengerReceivedFriendRequestsCard.tsx`, `MessengerFriendsScreen.tsx`, `MessengerFriendsMyProfileStrip.tsx` |
| U-5 | 시트 머리 통일: 친구 요청(중앙 → 하단), 친구 관리, 설정(「닫기」 글자 → X), 그룹 생성(× → X, 본문 제목 중복 제거), 모임 찾기, 새 대화(번호 카드 → 메뉴), 메신저 알림 센터, 대화 필터(중앙 → 하단) | 각 시트 |
| U-6 | 대화 행 길게 누르기: 셀 옆 드롭다운 → 하단 행동 메뉴(방 이름 머리 · 3묶음 · 「나가기」 빨간색) | `MessengerChatRoomActionSheet.tsx` |
| U-7 | 보관함: 카드 4개 → 목록 행(아이콘 타일 · 이름 · 개수 · ›), 상세 시트 공용 머리 | `MessengerArchiveScreen.tsx` |
| U-10 | 친구 요청·수락 알림이 legacy `notification_type: "status"` 때문에 거래로 분류 → `meta.kind` 가 `friend_request`·`friend_accepted` 면 커뮤니티 | `lib/notifications/member-notification-domain.ts` |
| 보류 | U-8·U-9 통화 탭 행은 `components/community-messenger/call-history/**` = 통화 규정 범위 → 이번 묶음에서 제외, 통화 단독 커밋으로 별도 반영 | — |
| 보류 | 헤더 종(알림 92) 팝업은 앱 전체 공용 `PhilifeHeaderNotificationInbox` — 메신저 범위 밖, 변경 안 함 | — |

### 13-6. 통화 탭 행 U-8·U-9 — 통화 규정 영향 분석 (구현 전 · Owner 승인 대기)

**왜 (증거)**
- U-8: 캡처 `ui-05-calls.png` — `w테스트1(@wwww)` 띄어쓰기 없음(`CommunityMessengerCallRow.tsx` 제목 span), 재다이얼 버튼 48px 채운 초록 원(`#00754A` 하드코딩, `CommunityMessengerCallActionButton.tsx`), 상태 칩 색 하드코딩(`#006241`·`#E53935`, `CommunityMessengerCallDirectionBadge.tsx`) → 친구·대화 행과 양식·토큰 불일치.
- U-9: 같은 캡처 15:35 PHT 에 w테스트1 행 「친구 아님」. 운영 DB 상 15:29:06 수락으로 이미 친구. 서버는 목록 조회 시점의 친구 여부(`service.ts` `listCommunityMessengerCallLogs` → `hydrateProfiles` → `peerRelationLabel`)를 내려주므로, **수락 전에 받아 둔 통화 목록이 재조회 없이 표시**된 것(클라이언트 캐시). 서버 계산 자체는 정상.

**바꾸는 것 (웹 표시만)**
| 파일 | 변경 |
|---|---|
| `call-history/CommunityMessengerCallRow.tsx` | 제목 `이름 (@아이디)` 띄어쓰기 · 「친구 아님」은 홈의 현재 친구 목록(`friendIds`) 기준으로 표시(서버 값은 친구 목록이 없을 때만) |
| `call-history/CommunityMessengerCallActionButton.tsx` | 40px 테두리형(`--messenger-primary` 토큰), 동작(onPress → 발신 확인 팝업) 그대로 |
| `call-history/CommunityMessengerCallDirectionBadge.tsx` | 하드코딩 색 → `--sam-*` 상태 토큰 |

**바뀌지 않는 것**: 발신 확인 팝업·발신 시작(`onRequestOutgoingConfirm`)·세션 생성·VoIP/FCM 발송·CallKit/Android 수신 화면·취소/거절/종료/부재중·통화 기록 저장·스와이프 삭제·서버 `service.ts`·네이티브 파일 전부.
**영향 경로**: 통화 탭 목록 표시만. 통화 진행 경로와 무관 → 설치된 구 바이너리 호환 영향 없음(웹만, 네이티브 계약 무변경).
**회귀 위험**: 재다이얼 버튼 터치 영역 축소(48→40px, 최소 터치 44px 은 버튼 주변 패딩으로 유지) · 스와이프 삭제와 버튼 탭 충돌.
**롤백**: 단독 커밋 1개 revert.
**반영**: 통화 단독 커밋 · 단독 main 반영.
**실기기 검증**: 통화 탭 표시(Samsung·iPhone) + 재다이얼 → 발신 확인 팝업 → 음성 발신·수신·종료 1회(Android→iPhone, iPhone→Android) · 스와이프 삭제 1회 · 친구 수락 직후 통화 탭 「친구 아님」 사라짐. 각 시각 운영 DB 대조.

### 13-7. D-2 원인 좁히기 (2026-10-25 실기기)

| 시각 (PHT) | 기기 | 조건 | 결과 |
|---|---|---|---|
| 15:29:06 | iPhone | 백그라운드 → 앱 복귀 직후 팝업 수락 | 안내 없음 (Owner) |
| 18:19:02 | Samsung | 메신저 밖(`/philife`) 앱 켜 둔 채 수락 | 안내 표시 (DOM `role=status` 740–784px visible) |
| 18:41 | iPhone | 앱 재시작 후 커뮤니티 화면 켜 둔 채 수락 (Production `a52be47da`) | 안내 표시 (Owner) |

→ 결함은 **iOS 앱 복귀 직후**에만. 안내는 `shouldSuppressCallOverlayToasts()` 가 참이면 보류(`pendingNonError`)되고, 스낵바 호스트가 「억제 → 해제」 변화를 볼 때만 재생된다. 복귀 직후 참이 될 수 있는 조건 5개(통화 화면 DOCK·iOS PiP·Android PiP·dock 전환 중·복원 중) 중 어느 것인지는 iPhone WebView 상태를 직접 읽어야 확정 — 추정 수정 금지. 다음: iPhone USB 연결 + Web Inspector(`ios_webkit_debug_proxy`) 로 복귀 시점 상태 기록 후 원인 확정. 관련 파일(`call-dock-presentation.ts` 등)이 통화 규정 범위면 수정 전 영향 분석·승인.

## 14. 종합 실측·결함·수정 설계 (2026-10-25 19:00 PHT · Production `d6f1de342` · Samsung 앱 재시작 후 · iPhone Web Inspector)

Owner 지시(18:58): 하나씩 땜빵 금지 — 시나리오별 문제를 다시 확인·종합 보고 → 전체 설계 → 구현. 증거 없는 항목은 「미재현/추정」으로 표시.

### 14-1. 시나리오 실측표

| # | 시나리오 | 결과 | 증거 |
|---|---|---|---|
| S-1 | @검색 카드 열기 → 뒤 목록 어둡게 | PASS (막 폭 1152px, 오른쪽 끝까지) | CDP, `A1-open.png` |
| S-2 | 뒤로 버튼 | 키보드+카드 함께 닫힘 | 이벤트 기록 04.717/04.765 |
| S-3 | 어둡게 영역 탭 | 카드 닫힘·키보드 내림 PASS | CDP |
| S-4 | 탭 전환 | 검색어 비움·카드 닫힘 PASS | CDP |
| S-5 | 결과 행 탭 → 프로필 | 카드 닫힘 PASS | `v-05-profile.png` |
| S-6 | 결과 행에서 친구 요청/취소/수락 · 상대 수락(실시간) | **카드가 열린 채 남음** (Owner 18:49 캡처) | 코드: 행 버튼은 상태 변화가 보이도록 일부러 유지 |
| S-7 | 입력 직후 카드가 저절로 닫힘·포커스 빠짐 | 1회 발생, 같은 순서 3회 재현 실패 | CDP 19:03 / 이벤트 기록 |
| S-8 | 대화 행 길게 누르기 | S3 메뉴 PASS | `S-longpress.png` |
| S-9 | 친구 관리·친구 요청·설정 시트 머리 | S1 PASS | `S-friend-manage.png`, `S-req-sheet.png`, `v-07-settings.png` |
| S-10 | 그룹 생성 시트 본문 | **본문이 예전 글자 카드(「친구 초대형 / 비공개 그룹」)** — 머리만 바뀜 | `S-newconv.png` |
| S-11 | 통화 탭 행 | 띄어쓰기·테두리 버튼 PASS, 친구인 w테스트1 「친구 아님」 없음 | `S-calls.png` |
| S-12 | 알림(앱 공용 팝업) 친구 알림 분류 | 「커뮤니티」 PASS (U-10) | `S-noti.png` |
| S-13 | 보관함 「보관 채팅」 개수 | **0 표시 / 운영 DB is_archived 4건** | DB 조회 18:37 |
| S-14 | 친구 프로필 「대화 알림 끄기」 | **1:1 대화가 있는데도 「대화 시작 후 설정 가능」(비활성)** | `d2-24.png` |
| S-15 | D-2 iOS 복귀 후 수락 안내 | 18:57 재시험 PASS (복귀 18:57:38 → 안내 18:57:41.9, 보류값 내내 false). 15:29 실패는 미재현 | iPhone Web Inspector 기록 |
| S-16 | 받은/보낸 요청 카드 새 디자인 | 대기 요청이 없어 이번 회차 미측정 | — |

### 14-2. 정책 조사 (텔레그램 기준 · Owner 18:58)

| Owner 정책 | 현재 코드 | 차이 |
|---|---|---|
| 친구 아니어도 @아이디로 대화·통화 | 대화: 차단·정지만 막음(`social-relations.ts:315-399`). 통화: 차단·상대 공개범위만(`direct-call-permission.ts:269-358`, 기본 everybody) | 충족 |
| 상대가 친구 요청 **거절**하면 대화·친구 불가 | 거절은 요청 상태만 `rejected`(`20270625120000…sql:195-236`), 대화·통화·목록 영향 없음, 다시 요청 가능(`:71-73`) | **미충족** |
| 상대가 **차단**하면 대화·친구 불가 | 메시지·통화 양방향 차단 충족. 친구 행은 차단한 쪽만 삭제(`service.ts:10378`), 방은 차단한 쪽에서만 숨김(`participant-block-hide.ts`) | 대화 불가는 충족, 친구 행 정리는 한쪽만 |
| 「대화 내역이 없다가 친구 추가하면 이전 대화가 나온다」 | 친구 여부로 방을 숨기는 코드 없음. 메시지 없이 만들어진 방은 홈 캐시·실시간 목록에 안 들어오고(방 생성 시 캐시 무효화 없음, 실시간은 이미 목록에 있는 방만 구독), 친구 이벤트로 홈을 다시 불러올 때 나타남(추정 — 기기 재현 필요). 나간 방(`left_at`)은 프로필에서 대화 열면 재입장되어 예전 내역 표시 | 원인 후보 2개, 기기 재현으로 확정 필요 |

### 14-3. 수정 설계 (구현 단위 · 순서)

**① UI (웹만 · 이번 묶음)**
- S-6: 검색 카드 행 버튼(요청·취소·수락·거절) 처리 성공 → 카드 접힘 + 키보드 내림 + 결과 안내 스낵바. 실시간 상태 변화는 카드 안 상태만 갱신(열려 있을 때 사용자가 보던 목록을 강제로 닫지 않음).
- S-10: 그룹 생성 「어떤 그룹을 만들까요?」 선택지를 S3 메뉴(아이콘 + 제목 + 설명)로.
- S-7: 이벤트 기록기로 재발 시 원인 확정 — 증거 전 수정 안 함.

**② 데이터 표시 결함 (원인 조사 후 수정 · 웹/서버)**
- S-13 보관 채팅 개수, S-14 대화 알림 비활성 — 원인 미확인. 조사 → 원인 확정 → 수정.

**③ 정책 (서버·DB·통화 권한 → Owner 별도 승인, 통화 권한은 통화 규정 단독)**
- 거절 = 요청자 → 거절한 사람 방향 대화·통화·재요청 불가(거절한 사람은 보관함에서 해제 가능). 대화 게이트(`resolveDirectInteractionGuard`·`direct-room-communication-gate`)에 거절 상태 반영, 재요청 차단은 DB 함수(`cm_send_friend_request`) 변경, 통화 게이트(`direct-call-permission.ts`)는 통화 단독 커밋.
- 차단 시 양쪽 친구 행 정리.
- 「이전 대화가 나타남」: 기기에서 재현해 원인 확정 → 방 생성 시 양쪽 홈 캐시 무효화 + 새 방 실시간 반영.

### 14-4. ①② 구현 결과 (`eb3309926` · 19:14 PHT)

| # | 원인 (증거) | 수정 |
|---|---|---|
| S-13 보관 0 · S-14 대화 알림 비활성 | 서버 lite 275방(보관 4건 `isArchivedByViewer:true`) / 홈 React 상태 30방 · 보관 필드 없음 / sessionStorage `bootstrap.v1`·`minimal.v1`·`critical.v1` 모두 30방(Samsung CDP 19:09). 홈이 critical 시드(상위 30방·`clientHydrationTier:"critical"`)일 때 `primeBootstrapCache` 가 tier 를 무조건 `full` 로 저장(`bootstrap-cache.ts:179`) → deferred lite 가 `peekBootstrapCache()` 캐시로 단락(`cm-bootstrap-client-fetch.ts:101-105`) → 전체 목록이 끝내 안 들어옴. 시작 시에도 `staleFullOnly` 로 네트워크 생략 | critical 데이터는 full slot 에 쓰지 않음. 단위 테스트 3건 |
| S-6 검색 카드 | 행 버튼은 상태 표시용으로 일부러 유지 | 처리 성공 뒤 접힘 + 키보드 내림(결과는 홈 스낵바), 실패면 유지 |
| S-10 그룹 생성 | 머리만 교체, 본문 미적용 | S3 메뉴 |
| 「친구 추가하면 예전 대화가 나타남」 | S-13 과 같은 원인일 가능성 큼(상위 30방 밖 대화가 목록에 없다가 새로고침 때 나타남) | 배포 후 같은 조건 재현으로 확인 |

기존 실패(무관 · 보고만): `messenger-image-auto-save*.test.ts`·`native-login-interrupt-marker.test.ts` 17건 — 변경 전 코드에서도 동일 실패.

### 14-5. ③ 정책 변경 영향 분석 (구현 전 · Owner 승인 대기 · 통화 권한 포함 → 통화 규정 3번)

**목표 (Owner 18:58, 텔레그램 기준)**: 친구 아니어도 @아이디로 대화·통화 가능(현행 유지). 상대가 친구 요청을 **거절**하거나 **차단**하면 그 상대와 대화·친구 불가.

**바꾸는 것**
| 영역 | 파일·함수 | 변경 |
|---|---|---|
| 대화 시작·발송 | `lib/community-messenger/social-relations.ts` `resolveDirectInteractionGuard` · `direct-room-communication-gate.ts` `assertDirectRoomCommunicationNotBlocked` | 「요청자 → 거절한 사람」 방향에 `rejected` 요청이 있으면 `canMessage:false`(사유 `peer_rejected_friend_request`). 거절한 사람 쪽은 막지 않음 |
| 재요청 | DB 함수 `cm_send_friend_request` (새 마이그레이션) | `rejected` 를 `pending` 으로 되살리지 않고 `request_rejected` 오류 — **운영 DB 적용은 별도 승인** |
| 거절 해제 | 보관함 「거절한 요청」 목록 + 해제 API | 거절한 사람이 해제하면 `rejected` → `cancelled`, 다시 대화·요청 가능 |
| 통화 | `lib/community-messenger/direct-call-permission.ts` `canStartDirectCallBetweenUsers` (`deny_peer_rejected`) | **통화 단독 커밋** — 발신 시작 판정만, 세션·푸시·네이티브 무변경 |
| 차단 | `service.ts` `cleanupCommunityMessengerFriendGraphOnBlock` | 친구 행 양쪽 정리(현재 차단한 쪽만) |
| 화면 | 방 입력창·프로필·검색 결과 | 거절된 상대: 입력창 대신 「상대가 친구 요청을 거절해 대화할 수 없습니다」, 통화·요청 버튼 비활성 + 사유 |

**영향 경로**: 1:1 방 생성(`startCommunityMessengerDirectChat`)·메시지 발송·통화 발신 판정·친구 요청 API·홈 목록(방은 숨기지 않음 — 텔레그램과 같이 기록은 보이되 발송 불가).
**구 바이너리 호환**: 웹·서버만 — 설치된 앱 재빌드 불필요. 통화 거부는 기존 `deny_*` 사유와 같은 응답 형식이라 구 바이너리도 「통화할 수 없음」 처리.
**회귀 위험**: 기존 `rejected` 데이터(과거 거절 이력)가 있는 쌍이 즉시 대화 불가로 바뀜 → 운영 DB 읽기 전용 조회(19:16 PHT): `rejected` 4건 · 4쌍 · 최근 2026-06-15 — 적용 시 이 4쌍은 요청자 방향 대화·통화 불가로 바뀜(거절한 사람이 해제 가능).
**롤백**: 커밋 revert + 마이그레이션 함수 이전 정의 재적용.
**실기기 검증**: 거절 → 요청자 대화 입력·통화·재요청 불가 / 거절한 사람은 가능 / 해제 → 정상 / 차단 → 양쪽 친구 해제·대화·통화 불가 / 기존 친구·비친구 대화·통화 정상(Android↔iPhone 음성·영상 1회씩).

### 14-6. ③ 정책 구현 결과 (2026-10-25 · Owner 「§14-5 승인 · 통화 단독 · DB 운영 적용 전 보고」)

| 커밋 | 범위 | 내용 |
|---|---|---|
| `3b5e61840` (19:35) C1 웹·서버 | 대화·요청·차단·보관함 | 거절 판정 `fetchFriendRequestRejectedByPeer` · 메시지 발송 게이트(텍스트·이미지·음성·파일) `rejected_by_peer` 403 · 방 입력창 `snapshot.directMessageDenied`(blocked·rejected_by_peer) 사유 표시 · 방 열기·지난 기록은 허용 · 재요청 서버 차단 `request_rejected` · 보관함 「거절한 요청」 목록·해제(`/friend-requests/rejected`) · 차단 시 친구 삭제 SSOT 로 양쪽 정리 + 대기 요청 닫기 |
| `84b392358` C2 DB 파일 | 마이그레이션 파일만 · **운영 미적용** | `20270626120000_cm_send_friend_request_block_rejected_resend.sql` — rejected 만 되살리지 않음(나머지 운영 정의와 동일). 운영 schema_migrations 버전 충돌 없음 |
| `9f3c966a9` (19:40) C3 통화 단독 | 발신 판정만 | `canStartDirectCallBetweenUsers` → `deny_peer_rejected`(차단·계정 제한 다음, 방·공개범위 전) · 문구 `cm_call_deny_peer_rejected` · 세션·푸시·수신 화면·네이티브 무변경 |

검증(로컬): 타입 검사 PASS · 정책 계약 5 + 통화 거부 3 + 기존 계약 2건 갱신 PASS · lint 오류 0. 기존 실패(무관): 이미지 자동 저장·장바구니·앱 캐시 정리 테스트 — 변경 전 코드에서도 동일 실패.

**운영 DB 적용 요청 (C2)**: 적용 전에도 서버가 재요청을 먼저 막으므로 정책은 지켜진다. DB 함수는 서버를 거치지 않는 경로까지 막는 이중 안전장치. 적용 대상 1개 함수(`cm_send_friend_request`), 영향 = 기존 rejected 4건(최근 2026-06-15)의 요청자가 재요청 시 `request_rejected`. 롤백 = 20270625120000 정의 재적용.

**실기기 검증 계획 (배포 후)**: Samsung(q)·iPhone(w, 미러링) — ① w→q 요청, q 거절 ② w: 대화 입력창 사유 표시·발송 403·음성/영상 발신 거부 문구·재요청 거부 ③ q→w 대화·통화는 정상 ④ q 보관함 「거절한 요청」 해제 → w 대화·통화·요청 정상 ⑤ 차단 → 양쪽 친구 해제·대화·통화 불가 ⑥ 정상 친구 Android↔iPhone 음성·영상 발신·수신·종료 1회씩(통화 회귀). 각 시각 운영 DB 대조.

### 14-7. ③ 운영 DB 적용 · 실기기 검증 결과 (2026-10-25 19:42–19:53 PHT · Production `9f3c966a9` · Samsung q / iPhone w 미러링·Web Inspector)

| # | 시험 | 결과 | 증거 |
|---|---|---|---|
| DB | `20270626120000` 운영 적용 | **PASS** `FN_OK\|ACL_OK\|SR_OK\|MIG_OK` (19:42:35), 기존 rejected 4건 변동 없음 | SQL |
| ① | q→w 요청 19:44:23 → iPhone 팝업 실시간 → w 거절 19:44:36 | PASS (`rejected`) | DB · 미러링 |
| ① | q 재요청 | PASS — 「상대가 친구 요청을 거절해 다시 요청할 수 없습니다.」(19:45:13), DB rejected 유지. DB 함수 직접 호출(ROLLBACK) `request_rejected` | CDP · SQL |
| ① | q 1:1 방 | PASS — 지난 기록 보임, 입력창 비활성 「상대가 친구 요청을 거절해 메시지를 보낼 수 없습니다.」 | `P-08.png` |
| ① | q 메시지 API 직접 | PASS — 403 `rejected_by_peer`, DB 저장 0건 | CDP · SQL |
| ① | q 통화 | PASS — 통화 버튼 비활성, snapshot `deny_peer_rejected` · 통화 API 403 `call_denied_peer_rejected` · 세션 0건 | CDP · SQL |
| ② | w(거절한 쪽) → q | PASS — `directMessageDenied:null` · 음성/영상 가능 · 메시지 200 (19:47:59) | iPhone Web Inspector |
| ③ | w 보관함 「거절한 요청」 → 해제 | PASS — 목록 q테스트1 표시, 해제 → `cancelled` 19:48:50, 목록 비움 | 미러링 · SQL |
| ③ | 해제 후 q | PASS — 통화 가능 · 입력창 「메시지」 · 발송 200 · 재요청 200 (19:49:27) → w 수락 19:49:43 | CDP |
| ④ | q 가 w 차단 (19:50:40) | PASS — 양쪽 `friend` 행 삭제(blocked 만 남음), 수락 요청 `cancelled` 19:50:41, w 친구 목록에서 q 제외, w→q 메시지 403 `blocked_target`, w snapshot `deny_blocked`·`blocked` | SQL · Web Inspector |
| ④ | 차단 해제 (19:51:41) | PASS — `is_active=false` | SQL |
| ⑤ | q→w 음성 발신 19:52:26 | 서버 PASS — 세션 19:52:28.6, VoIP 푸시 `sent` 19:52:28.9, 앱 내 알림 `ios_call_alert_callkit_owned`(CallKit 담당), 무응답 19:52:59 `missed`·부재중 푸시. **iPhone 화면 수신·연결은 NOT_PROVEN** — CallKit 화면은 미러링에 표시되지 않음 | SQL |
| 부가 | S-6 검색 카드 처리 후 접힘 · S-13 보관 채팅(4)·홈 275방 | PASS | `P-03.png` |

남은 실기기: 통화 행렬(Android↔iPhone 음성·영상 수신·연결·종료) — iPhone 을 손으로 받아야 함.
관찰(범위 밖 · 보고만): 거절당한 쪽 방 상단 안내 바의 「친구 추가」 버튼이 활성 — 누르면 거부 안내가 뜨지만 미리 비활성·사유 표시가 더 명확. 통화 버튼 비활성 시 사유 문구 없음.

### 14-8. 통화 회귀 행렬 (2026-10-25 19:52–20:00 PHT · Production `9f3c966a9` · Samsung q ↔ iPhone w · Owner 가 iPhone 조작)

| # | 시험 | 세션 (PHT) | 결과 |
|---|---|---|---|
| T0 | Samsung→iPhone 음성 무응답 | 생성 19:52:28.6 · VoIP 푸시 sent 19:52:28.9 · missed 19:52:59 · 부재중 푸시 | PASS (서버) |
| T1 | Samsung→iPhone 음성 수신·연결·발신자 종료 | 19:55:32 → 응답 19:55:44 → `ended_by_caller` 19:56:10 · 기록 「음성 통화 · 24초」 | PASS |
| T2 | iPhone→Samsung 음성 수신·연결·수신자 종료 | 19:57:09 → 응답 19:57:21 → `ended_by_callee` 19:57:57 · Samsung 수신 화면 「음성 통화 수신」 | PASS |
| T3 | Samsung→iPhone 영상 거절 | 19:58:36 → `declined` 19:58:42 · 발신자 「통화 거절 · 상대방이 통화를 거절했습니다.」 | PASS |
| T4 | 벨 중 취소 → 재울림 없음 | 19:59:18 → `canceled` 19:59:30 · 푸시: ring 19:59:18.9, cancel 19:59:30.4, 이후 ring 0건 | 서버 PASS · iPhone 재울림 Owner 확인 |
| T5 | Samsung→iPhone 음성 · iPhone 에서 종료 | 19:59:53 → 응답 20:00:01 → `ended_by_callee` 20:00:08 · 기록 「음성 통화 · 5초」 | PASS |
| T6 | 정상 종료 직후 재발신 → 거절 | 20:00:29 → `declined` 20:00:36 | PASS |
| — | 통화 중(busy) | 3번째 기기 필요 | NOT_PROVEN |
| — | 영상 연결(수락) | 영상은 거절만 시험 | NOT_PROVEN |

**T4 재울림**: Owner 확인 — 취소 뒤 iPhone 다시 울리지 않음 → **PASS**.

**C-N1 (새 관찰 · Owner 20:0x)**: 「음성 통화 종료 후 iPhone 에만 알림, Samsung 은 정상 종료」. 운영 DB 조사(읽기 전용): 19:52–20:01 w(iPhone) 대상 서버 발송은 T0 부재중 1건(`notification_events.missed_call` 19:53:00)뿐, 정상 종료 통화(T1·T2·T5)는 `call_end` 가 모두 `skipped`(`ios_voip_call_ended_media_owned`·`ios_call_alert_callkit_owned`) → **서버 푸시가 아님**. 기기 내부(앱 로컬 알림 또는 iOS 통화 시스템) 생성으로 추정 — 알림 문구·시각(캡처) 확보 후 원인 확정. 통화 규정 범위(네이티브 포함 가능) → 수정 전 영향 분석·승인.

### 14-9. C-N1 원인 확정 · 수정 계획 (통화 규정 3번 · 구현 전 · Owner 승인 대기)

**왜 (증거, 2026-10-25 20:05–20:06 PHT 재현)**: Samsung→iPhone 음성(세션 `5641094c…` 20:05:58 → 연결 20:06:18 → Samsung 종료 20:06:25). iPhone Web Inspector 기록 — 20:06:14.7 앱 가려짐(CallKit) · 20:06:26.1 앱 다시 보임 · 20:06:26.9 통화 기록 행 갱신 · **20:06:27.3 앱 내 배너 「메신저 · 새 메시지가 도착했습니다」 생성**(내용 없이 몇 초 뒤 사라짐). 서버 푸시 아님(§14-8).
- 경로: 통화마다 방에 `call_stub` 메시지 1건(벨 시작 시각에 생성, 종료 때 문구 갱신) → `dibay_append_room_message_atomic` 이 일반 메시지와 같이 상대 안 읽은 수 +1 → 앱이 「참가자 안 읽은 수 증가」만 보고(`cm-participant-unread-full-effects.ts` · `resolveParticipantUnreadDeltaInAppEffects`) 메시지 종류 모른 채 일반 배너 표시. 통화 중엔 앱이 가려져 보류됐다가 복귀 직후 뜸. Samsung 은 그 방을 보고 있거나 자기가 만든 기록이라 배너 없음.

**수정 방향 (결정)**: 통화 기록은 「새 메시지」가 아니다(텔레그램 기준 — 통화는 통화 UI·부재중 알림이 알린다).
1. DB `dibay_append_room_message_atomic`: `call_stub` 은 상대 안 읽은 수를 올리지 않는다(마지막 메시지·미리보기·정렬 갱신은 유지 → 대화 목록에 「음성 통화 · 24초」 표시 그대로).
2. 부재중은 이미 별도 경로로 알림(`notification_events.missed_call` + 부재중 푸시 + 통화 탭 부재중 표시) — 대화방 안 읽은 수에는 넣지 않는다.

**바꾸는 것**: DB 함수 1개(마이그레이션 · 운영 적용 별도 승인). 웹 코드 변경 없음(배너는 안 읽은 수가 안 늘면 자연히 안 뜸).
**바뀌지 않는 것**: 통화 발신·세션·VoIP/FCM·CallKit/Android 수신 화면·취소/거절/종료·부재중 알림·통화 기록 메시지 생성과 문구·네이티브 파일.
**영향 경로**: 1:1·그룹 방의 통화 기록 메시지 안 읽은 수·배지·대화 목록 굵은 표시. 부재중 통화도 대화방 배지에서 빠짐(통화 탭·알림함 부재중으로만 표시).
**구 바이너리 호환**: 서버 DB 판정만 바뀜 — 설치된 앱 영향 없음.
**회귀 위험**: 일반 메시지 안 읽은 수 경로를 건드리면 배지 회귀 → 함수 안 `call_stub` 분기만 추가, 다른 타입은 동일. 기존 안 읽은 수(이미 쌓인 call_stub 분)는 읽으면 정상 소거.
**롤백**: 이전 함수 정의 재적용.
**실기기 검증**: 통화 종료 후 iPhone·Samsung 배너 없음 · 대화 목록 통화 기록 표시·정렬 유지 · 일반 메시지 안 읽은 수·배너 정상 · 부재중 알림 정상 · Android↔iPhone 음성 1회.

**§14-9 정정 · 구현 (`970aed928` 20:14 PHT · 통화 단독)**: 조사 중 기존 설계 확인 — 부재중은 `call_stub` 이 대화방 안 읽은 수를 올리는 것으로 표시하고 Bell 은 이를 중복 집계하지 않음(`call-missed-notification-authority.ts`). 처음 계획(통화 기록 전부 제외)은 부재중이 어떤 배지에도 안 잡히는 회귀 → **부재중만 안 읽은 수 유지, 받음·거절·취소만 제외**로 정정. DB 변경 없음(기존 `incrementUnread`/`p_counts_as_unread` 사용, 운영 함수 정의상 participants unread UPDATE 만 제어). 네이티브: iOS/Android 에 `call_stub` 사용처 없음, 앱 아이콘 배지는 서버 합계 표시만 → **네이티브 무변경·무영향**.
실기기 검증(배포 후): ① 받은 음성 통화 종료 → iPhone 앱 내 「새 메시지」 배너 없음 ② 무응답(부재중) → 대화방 안 읽은 수 +1 유지·부재중 알림 정상 ③ 일반 메시지 → 배너·안 읽은 수 정상.

**C-N1 실기기 검증 (Production `970aed928` · 2026-10-25 20:29–20:35 PHT)**
| # | 시험 | 결과 |
|---|---|---|
| ① | Samsung→iPhone 음성 받음 → Samsung 종료 (20:30:24 연결 · 20:30:33 종료) | **PASS** — iPhone 앱 20:30:33.4 복귀 후 11초간 「새 메시지」 배너 0건, w 안 읽은 수 2 유지 (20:29 1차 시도는 기기 화면 재로드로 기록 유실 → 재시험) |
| ② | 무응답 → 부재중 (20:30:58 → `missed` 20:31:29) | **안 읽은 수 PASS** (2→3). 부재중 알림은 생성 안 됨 → C-N2 (C-N1 무관, 아래) |
| ③ | 일반 메시지 (20:34:50) | **PASS** — 안 읽은 수 3→4, iPhone 배너 즉시 표시 |

### 14-10. C-N2 부재중 알림 간헐 누락 (통화 단독 · 구현 ff06a724e · 실기기 PASS)
- 증거: 20:31:29 부재중 전환은 앱 서버(`node`)의 상태 조회 중 시간 초과 처리 — Supabase edge 로그상 세션 PATCH → call_events → call_logs → signals → call_stub append → broadcast 까지 있고 **notification_events 생성·푸시 0건**. 비교: 19:52:59 T0 부재중은 1초 뒤 GET 요청 안에서 알림 생성·푸시 정상.
- 원인(코드): `updateCommunityMessengerCallSession` 이 `void notifyRoomBoundMissedCallBestEffort(...)`(`service.ts:21535`, 21714 동일) — 응답 반환 후 기다리지 않는 작업. Vercel 서버리스는 응답 뒤 함수가 멈출 수 있어 짧은 요청에서 알림 작업이 잘린다(긴 요청 안에서는 살아남아 T0 는 정상).
- 수정 방향: 이 프로젝트의 다른 알림처럼 Next `after()` 로 응답 뒤 실행을 보장(친구 요청 알림과 같은 방식). 부재중 판정·대상·문구 무변경.
- 바뀌지 않는 것: 통화 세션·VoIP/FCM 수신·CallKit·통화 기록·네이티브.
- 실기기 검증: 무응답 3회 → 매번 부재중 알림(알림함·푸시) 생성, 시각 대조.
- 구현(Owner 승인 2026-10-25): `ff06a724e` (통화 단독) — `scheduleRoomBoundMissedCallNotification` 이 `after()` 로 예약(요청 범위 밖이면 즉시 실행), 2곳 교체. 계약 테스트 `call-missed-notification-after-contract.test.ts`. 네이티브 무변경.
- 로컬 검증 PASS: typecheck:build · vitest 29파일 241건 · eslint 오류 0.
- Production: `dpl_2Cnr38tUGtrp6yz5HGiAHfWagYBq` READY, SHA `ff06a724e` (시험 직전 확인).
- 실기기(Samsung q테스트1 → iPhone w테스트1, 음성, 무응답) — 운영 DB 시각(PHT):

| 회 | 발신 | 세션 생성 | 부재중 전환 | notification_events | APNs 부재중 푸시 | 판정 |
|---|---|---|---|---|---|---|
| 1 | 20:44:16 | 20:44:18.7 | 20:44:49.3 | 20:44:50.4 | 20:44:50.7 sent | PASS |
| 2 | 20:45:43 | 20:45:45.5 | 20:46:16.4 | 20:46:17.5 | 20:46:18.1 sent | PASS |
| 3 | 20:46:55 | 20:46:57.3 | 20:47:28.3 | 20:47:29.3 | 20:47:29.7 sent | PASS |

  - VoIP 기기(454a…)는 매회 `ios_voip_missed_call_local_ring_timeout` 으로 skipped(기존 설계), 일반 APNs 기기(f487…)로 발송.
  - iPhone 화면의 알림 표시는 Owner 육안 확인 대상(서버 발송까지 PASS).

### 14-11. M-B1 앱 안 메시지 배너가 내용 없이 「새 메시지가 도착했습니다」 (메신저 단독 · 구현 9a789d580 · 실기기 PASS)
- Owner 지시(2026-10-25 20:50 PHT): 「메시지가 왔습니다」가 아니라 정확한 메시지 내용, 동일 UI.
- 증거:
  - 서버 알림은 정확함 — 운영 `notification_events`(w테스트1 수신): 20:34:50 `title=q테스트1`, `body=C-N1 일반 메시지 확인` / 부재중 `부재중 전화` · `q테스트1 · 부재중 음성 통화`. 앱 밖(OS 푸시)은 이 문구.
  - 앱 안 배너만 고정 문구 — `lib/community-messenger/notifications/cm-participant-unread-full-effects.ts:193-197` 이 `title=notify_messenger_banner_title(메신저)`, `preview=notify_messenger_new_message_arrived(새 메시지가 도착했습니다)` 를 넣는다. 웹 데스크톱 알림(같은 파일 132·203행)도 같다.
  - 원인: 배너의 유일한 입력이 `community_messenger_participants` 의 unread 증가(Realtime)뿐이라 누가·무엇을 보냈는지 모른다. `MessengerInAppMessageBannerHost` 주석도 「실시간 페이로드 연동 시 채운다」로 미완.
- 설계:
  1. 내용 출처 = 이미 매 증가마다 실행 중인 방 스냅샷 프리패치(`prefetchRoomSnapshotLazy`, force) 결과의 최신 수신 메시지 — 새 요청 없음.
  2. 문구 = OS 푸시와 같은 함수 `buildMessageNotificationDisplay`(1:1=보낸 사람/본문, 그룹=방 이름/「보낸 사람: 본문」, 사진·동영상·파일·위치 표기, `chat_preview_enabled` 꺼짐이면 내용 숨김). 부재중 통화 기록은 푸시와 같은 「부재중 전화 / 이름 · 부재중 음성(영상) 통화」.
  3. 내용이 준비된 뒤에만 배너 표시 — 내용 없는 배너 금지. 프리패치 실패 시 홈 목록 행(상대 이름·목록 미리보기)으로, 그것도 없으면 배너 생략(배지·목록은 그대로 갱신).
  4. UI = 프로필 사진 + 이름(굵게) + 본문 2줄 + 닫기, DIBAY 토큰(§13 통일 형식). 웹 데스크톱 알림도 같은 제목·본문.
- 바꾸는 파일: `cm-participant-unread-full-effects.ts`, `MessengerInAppMessageBannerHost.tsx`, `messenger-in-app-banner-store.ts`(avatar 필드), 계약 테스트. 서버·DB·통화·네이티브 무변경.
- 영향: 배너가 스냅샷 GET 만큼(약 0.3~1초) 늦게 뜬다. 알림음·배지·목록 시점은 그대로.
- 실기기 검증: Samsung→iPhone 1:1 글·사진, 그룹 글, 부재중 1회 — 배너 문구가 같은 시점 `notification_events` 제목·본문과 일치. 미리보기 끔 설정 1회.
- 구현(Owner 승인 2026-10-25): `9a789d580` (메신저 단독). 신규 `messenger-in-app-banner-content.ts`(문구)·`message-notification-room-kind.ts`(서버·배너 공용 방 종류 판정), `cm-participant-unread-full-effects.ts`(내용 확보 후 배너·데스크톱 알림, 없으면 생략), 배너 Host(사진·이름·본문 2줄). 서버 발송·DB·통화·네이티브 무변경.
- 로컬 검증 PASS: typecheck:build · vitest 181파일 1466건 · eslint 오류 0.
- Production: `dpl_3GsDY13kxjGffarh12x4vEdsS2ym` READY, SHA `9a789d580` (시험 직전 확인).
- 실기기(Samsung q테스트1 → iPhone w테스트1, iPhone 메신저 홈·앱 앞) — iPhone Web Inspector 로 배너 DOM 기록, 운영 DB 대조(PHT):

| 시험 | DB 생성 | DB 알림 제목 / 본문 | iPhone 배너 표시 | 배너 제목 / 본문 | 판정 |
|---|---|---|---|---|---|
| 1:1 글 | 메시지 21:03:13.6 | q테스트1 / MB1 text banner check | 21:03:15.2 | 동일 + 프로필 사진 | PASS |
| 사진 | 메시지 21:04:29.9 | q테스트1 / 사진을 보냈습니다 | 21:04:31.0 | 동일 + 프로필 사진 | PASS |
| 부재중 | 부재중 21:05:29.1 | 부재중 전화 / q테스트1 · 부재중 음성 통화 | 21:05:30.3 | 동일 + 프로필 사진 | PASS |

  - 「새 메시지가 도착했습니다」 고정 문구 0회. 그룹 글·미리보기 끔은 단위 테스트 PASS, 실기기 NOT_PROVEN.

## §15. 친구 관계 표시·CTA 명확화 (Owner 승인 · 메신저 4ceead890·288e471fb, 통화 21652bf38 · 실기기 일부 PASS)
- 지시: 통화 목록 「친구 아님」을 글자가 아니라 프로필 사진 표시·행 색으로 명확히. 대화방 2단 헤더(친구 추가·차단)는 무엇을 해야 하는지 버튼·배경으로 분명한 CTA.
- 현재(코드):
  - 통화 목록 `CommunityMessengerCallRow.tsx:269-276` — 부제 앞 회색 글자 「친구 아님 ·」. 대화 목록 `MessengerChatListItem.tsx:1067-1073` 도 같은 회색 글자(`cm_peer_badge_not_friend`).
  - 대화방 바 `MessengerUnknownPeerNoticeBar.tsx` — 설명 문구 없이 [친구 추가](녹색 테두리) + [차단](빨간 글자). 요청 보낸 뒤(pending)는 [친구 추가]가 사라지고 [차단]만 남아 상태 설명이 없다.
  - 이전 보고 결함 포함: 상대가 내 요청을 거절(rejected_by_peer)해도 바가 「stranger」로 [친구 추가]가 눌림 상태로 보인다(서버는 `request_rejected` 로 거부). 대화 입력창만 막힘.
- 설계(상태 3종을 목록·방에서 같은 표시로):

| 상태 | 판정(기존 값) | 목록 행(대화·통화 공통) | 대화방 2단 헤더 |
|---|---|---|---|
| 친구 | friendIds 에 있음 | 표시 없음 | 없음 |
| 친구 아님(대화 가능) | 친구 아님 · 차단/거절 아님 | 프로필 사진 오른쪽 아래 주황 배지(사람+물음표) · 행 왼쪽 주황 3px 띠 · 「친구 아님」 글자 제거(화면 읽기용 이름표만) | 주황 연한 배경 + 「친구가 아닌 사용자예요 · 모르는 사람이면 차단하세요」 + [친구 추가] 녹색 채움(주 버튼) · [차단] 빨간 테두리, 두 버튼 같은 폭 |
| 친구 요청 보냄 | peerFriendshipState=pending | 위와 같음 | 주황 연한 배경 + 「친구 요청을 보냈어요 · 수락을 기다리는 중」 + [차단] 빨간 테두리 |
| 대화·통화 불가 | 내가 차단 / 상대가 거절 | 프로필 사진 회색 + 빨간 금지 배지(첨부 이미지 형태) · 이름 회색 | 내가 차단: 빨간 연한 배경 + 「차단한 사용자예요」 + [차단 해제] / 상대 거절: 회색 배경 + 「상대가 친구 요청을 거절해 대화·통화를 할 수 없어요」, 버튼 없음 |

- 구현 단위(분리 반영):
  1. 메신저 단독: 공용 `MessengerPeerRelationAvatarBadge`(배지·행 띠), 대화 목록 적용, 대화방 바 4상태 + rejected_by_peer 분기(`community-messenger-room-phase2-peer-notice-logic.ts`, 기존 `directMessageDenied` 값 사용).
  2. 통화 단독(통화 규정 — 표시만): 통화 목록 행에 같은 배지·띠 적용. 통화 세션·발신·권한·푸시·네이티브 무변경, 「친구 아님」 판정식 그대로(U-9). 롤백 = 커밋 되돌리기.
- 바꾸지 않는 것: 친구·차단·거절 판정 서버·DB, 버튼 동작(요청·차단·해제 API), 통화 동작.
- 실기기 검증: Samsung·iPhone — 친구/친구 아님/거절/차단 각 1명의 대화 목록·통화 목록·대화방 헤더 화면, 태블릿 폭 1회.
- 구현(Owner 승인 2026-10-25): 메신저 단독 `4ceead890`(공용 배지·대화 목록·대화방 바 4상태·거절 분기) · 통화 단독 `21652bf38`(통화 목록 표시만, 내가 차단한 상대만 금지 배지) · 메신저 `288e471fb`(실기기에서 발견: `CommunityMessengerChatList` rowProps 에 `savedFriendIds` 누락 → 대화 목록 배지 미표시. 이전 「친구 아님」 글자도 같은 이유로 실기기 미표시였음).
- 로컬 검증 PASS: typecheck:build · 메신저 vitest 480파일 PASS(기존 무관 실패 2파일: messenger-image-auto-save*) · eslint 오류 0.
- 실기기(Samsung q테스트1, Production `288e471fb` READY 확인 후 앱 재시작, 21:23~21:29 PHT):
  - 통화 목록: 비친구 w테스트1 행 — 사진 물음표 배지 + 왼쪽 띠·연한 배경, 「친구 아님」 글자 없음 — PASS.
  - 대화 목록: 비친구 1:1 행 4개 배지·띠, 접속 점 오른쪽 위 — PASS.
  - 대화방 바: 친구 아님(설명 + [친구 추가] 녹색 채움·[차단] 빨간 테두리 같은 폭) PASS → [친구 추가] 탭 → 요청 보냄(설명 + [차단]) PASS.
  - NOT_PROVEN: 내가 차단 바·상대 거절 바·통화 목록 금지 배지, iPhone·태블릿 화면.
  - 색: 배지·띠는 DIBAY 경고 토큰(`--sam-warning`, 황토색) — 시안의 밝은 주황과 다름.

### 15-2. §15 실기기 결함 — 친구도 「친구 아님」 배지 (Owner 승인 · 메신저 253ce0a79 · 통화 cced0207e · Samsung·iPhone PASS)
- Owner 지적: 정상 통화·부재중 모두 「?」 — 시안과 다르다.
- 증거(21:31~21:36 PHT):
  - Samsung 통화 목록 상위 30행 전부 `stranger` 배지. 그중 zxzx11 은 운영 DB `user_social_relations` 상호 friend(활성) — 오판. 서버 통화 기록 값은 정확(`zxzx11=mutual_friend`, `w테스트1=stranger`).
  - 대화 목록도 메인관리자·ATOZ MAN·zxzx11(모두 DB 상호 친구)에 배지.
  - 원인: 홈 친구 목록 `data.friends` 는 친구 탭 진입 때만 조회(`CommunityMessengerHome.tsx:937-946`). 앱 재시작 후 대화·통화 탭에서는 `savedFriendIds.size=0`(React props 확인) → 모두 친구 아님. 친구 탭 진입 후 5명으로 채워짐. 통화 행은 서버 값보다 이 빈 목록을 우선(U-9).
  - iPhone: 21:02 PHT 로드(§15 이전 코드, 새 코드 청크 0) — 재시작 전이라 미반영. 친구 목록 4명 로드 상태.
  - 색: 시안 주황(#EF9F27)과 달리 `--sam-warning`(황토)로 구현 — 시안 불일치.
- 정정:
  1. 메신저: 홈 마운트 시 탭과 무관하게 친구 목록 1회 조회(기존 친구 탭 첫 진입 규칙과 같은 1회). 조회 완료 전에는 친구 목록을 「모름」으로 넘겨 대화 목록 배지 없음(오판 금지). 배지·띠 색을 시안 값(주황 #EF9F27, 행 배경 #FFF9EF)으로.
  2. 통화(표시만): 친구 목록이 「모름」이면 서버 통화 기록 값(`peerRelationLabel`)으로 판정(기존 홈 밖 규칙). 색을 시안 값으로. 발신·세션·푸시·네이티브 무변경.
- 실기기 검증: 앱 재시작 직후 대화·통화 탭(친구 탭 미방문) — zxzx11·메인관리자·ATOZ MAN 배지 없음, w테스트1 배지 있음. Samsung·iPhone 둘 다.
- 구현: 메신저 단독 `253ce0a79`(friendsListLoaded·마운트 1회 친구 조회·모름=undefined·색 시안 값, 눌림·선택 배경 우선) · 통화 단독 `cced0207e`(모름이면 서버 값 stranger·saved_by_peer 만, 색 시안 값). 로컬: typecheck PASS · 메신저 vitest 482파일 PASS(기존 무관 실패 2파일 image-auto-save) · eslint 오류 0.
- Samsung 실기기(Production `cced0207e` READY 확인, 앱 재시작 후 친구 탭 미방문, 21:43~21:44 PHT):
  - 대화 목록 상위 10행: w테스트1 만 `stranger`(배경 rgb(255,249,239)), zxzx11·메인관리자·ATOZ MAN(DB 상호 친구) 배지 없음, 그룹·거래·주문 방 없음 — DB 대조 일치 PASS.
  - 통화 목록: w테스트1 20행 전부 배지(정상·부재중 동일 — 사람 기준), zxzx11 10행 배지 없음 — PASS. 색 주황 #ef9f27 확인.
- iPhone 실기기(w테스트1, 앱 재시작 21:43:07 PHT 로드 — §15-2 청크·색 값 포함 확인, 친구 탭 미방문, 21:47 PHT):
  - 대화 목록 21행: 배지 = 김양수·zxzx11·이칠수·Hhhhh111·dddd (DB 모두 친구 아님). 배지 없음 = 메인관리자(상호 친구)·김선희·Shawn Park(내 친구)·그룹·거래·주문 — DB 대조 일치 PASS.
  - 통화 목록: q테스트1 22행·김양수 3행·zxzx11 1행 전부 배지(서버 값 stranger 와 일치, w 의 통화 상대는 모두 친구 아님). 행 배경 rgb(255,249,239)·띠/배지 rgb(239,159,39) — 시안 값 PASS. 「친구 아님」 글자 없음(화면 읽기 이름표만).
  - 잔여 NOT_PROVEN: 내가 차단 바·상대 거절 바·통화 목록 금지 배지, 태블릿 폭.

### 15-3. 남은 상태 실기기 확인 결과 + 친구 추가 진입점 통일 (Owner 승인 · 메신저 c2448ff23·bc298ce3c · 통화 0a1163338 · Samsung·iPhone·태블릿 PASS)
- 실기기 확인(21:48~21:53 PHT, Production `cced0207e`, 시험 상태는 확인 후 원복: 요청 cancelled·차단 0건):
  - 태블릿 샤오미(800×1340 가로, 분할 화면, zxzx11): 대화·통화 목록 배지 DB 일치 — 친구 아님 메인관리자·w테스트1 배지, 친구 q테스트1·테스트1·Charisse Mercado·zxzx22·zxzx44 없음 PASS.
  - 상대 거절 바(w 가 q 요청 거절 → Samsung q 방): 「상대가 친구 요청을 거절해 대화·통화를 할 수 없어요」, 버튼 없음, 통화 버튼·입력창 막힘 PASS. 단 배경이 시안 회색(#F1EFE8)이 아니라 베이지(`--sam-bg-surface-muted`) — 불일치.
  - 상대 거절 상태의 목록 행: 시안은 빨간 금지 배지인데 주황 「?」 — 목록에 「상대가 거절」 정보가 없음. FAIL.
  - 내가 차단 바: 차단 후 방에 바 없음 — FAIL. 원인: 방 스냅샷 상대 프로필이 `hydrateProfilesLabelsOnlyWithMap`(`service.ts:2270` `blocked: false` 고정)이라 `members[].blocked` 항상 false → `blockedByMe` 판정 불가(서버 `fetchBlockedPairFromSb` 의 `blockedByMe` 는 이미 조회하지만 버림). §15 이전부터 있던 결함 — [차단 해제] 바가 한 번도 안 떴을 것.
  - 내가 차단한 상대의 통화 목록 행: 빨간 금지 배지 아니라 「?」 — FAIL. 원인: 판정 원천 `peekBootstrapCache().blocked` 가 숨김·차단 목록 조회 전에는 비어 있음(§15-2 친구 목록과 같은 유형).
- 친구 추가 진입점(태블릿·Samsung 네 탭 화면):
  - 친구 탭: 검색창 오른쪽 [사람+](친구 요청·추가 시트, 받은 요청 수 배지) + [관리].
  - 대화 탭: 탭 줄 오른쪽 [사람+] — 실제 기능은 「그룹 만들기」(`MessengerHomeSectionTabs.tsx`, aria 「그룹 만들기」). 같은 아이콘이 다른 기능.
  - 통화·보관함 탭: 없음.
- 설계:
  1. 네 탭 공통: 탭 줄 오른쪽에 같은 [친구 추가] 버튼(사람+ 아이콘, 받은 요청 수 배지, 누르면 친구 요청·추가 시트) — 위치·모양·동작 동일.
  2. 그룹 만들기는 대화 탭에서만, [친구 추가] 왼쪽에 다른 아이콘(사람 여럿+)으로 구분.
  3. 친구 탭 검색창 오른쪽에는 [관리]만 남김(사람+ 는 탭 줄로 이동).
  4. 내가 차단 바: 방 스냅샷이 상대 `blocked` 를 서버 `blockedByMe` 로 채움(메신저 서버).
  5. 목록의 대화·통화 불가(빨간 금지 배지): 홈이 마운트 때 숨김·차단 목록과 「내 요청을 거절한 상대」 목록을 1회 조회해 「알 때만」 표시(§15-2 와 같은 원칙). 「내 요청을 거절한 상대」는 친구 목록 API 응답에 id 목록 추가(메신저 서버, 읽기만).
  6. 상대 거절 바 배경 = 시안 회색 #F1EFE8.
- 구현 단위: 메신저 단독(1·2·3·4·5의 홈·대화 목록·서버·6) → 통화 단독(통화 목록 행이 홈의 「알 때만」 차단·거절 목록 사용, 표시만).
- 실기기 검증: Samsung·iPhone·태블릿 — 네 탭 탭 줄 [친구 추가] 동일, 대화 탭 그룹 만들기 구분, 차단 바+[차단 해제], 차단·거절 상대 목록 금지 배지, 거절 바 회색. 시험 상태는 확인 후 원복.
- 구현: 메신저 `c2448ff23`(탭 줄 [친구 추가] 공통·그룹 만들기 UsersRound·검색 줄 [관리]만·방 스냅샷 blockedByMe·친구 API rejectedByPeerIds·unavailablePeerIds·거절 바 회색) · 통화 `0a1163338`(통화 행 unavailablePeerIds, 표시만) · 메신저 `bc298ce3c`(실기기 22:06 발견: 차단 목록이 부트스트랩 `[]`·idle 로 남아 미조회 → 마운트당 1회 idle 조회, social_sync 에서 차단 목록 갱신, 방 차단/해제 후 신호). 로컬: typecheck PASS · vitest 539파일 PASS(기존 무관 2파일 image-auto-save) · eslint 오류 0.
- Samsung(q테스트1, Production `bc298ce3c` READY, 22:05~22:17 PHT):
  - 네 탭 [친구 추가] 탭 줄 같은 자리·화면당 1개, 그룹 만들기는 대화 탭만(아이콘 구분) PASS.
  - 방 바 [차단] → 확인 → 차단: 대화 목록에서 방 숨김, 통화 목록 w테스트1 20행 빨간 금지 배지·회색 사진/이름 PASS. 보관함 > 차단 친구 > 차단해제 → 즉시 「?」 복귀 PASS.
  - 상대 거절(w 거절): 통화 목록 20행 금지 배지, 대화 목록 w테스트1 금지 배지, 검색 「대화를 시작할 수 없습니다」, 방 바 회색 rgb(241,239,232)·버튼 없음 PASS.
  - 「내가 차단」 바: 차단하면 방이 숨겨지고 방 주소 진입 시 홈으로 돌아가 바가 보일 경로가 없다(차단 해제는 보관함 > 차단 친구). 서버 값(`members[].blocked=true`)은 확인.
- 태블릿 샤오미(zxzx11, 앱 재시작 22:18 PHT): 네 탭 탭 줄 동일·친구 탭 검색 줄 [관리]만·대화 탭 그룹/친구 추가 구분 PASS, 대화 목록 친구 q테스트1 배지 없음·w테스트1 「?」 PASS. (태블릿 앱은 WebView 디버깅 꺼짐 — 화면으로만 확인)
- 시험 상태 원복: 요청 cancelled · 차단 0건. 남은 것: q 쪽 방 `hidden_at`(22:05 차단 때 설정) — 운영 DB 데이터 변경이라 미처리, 방 진입은 정상.
- 범위 밖 발견(보고만): 보관함 > 차단 친구에서 해제하면 `blocked_hidden_at` 만 지워지고 차단 때 숨긴 대화방(`hidden_at`)은 복원되지 않음(관계 API DELETE 경로는 `restoredRoomIds` 로 복원). w테스트1 쪽 q 방은 `is_archived=true`(이전 시험 상태).
- iPhone(w테스트1, 앱 재시작 22:19:29 PHT 로드 — 새 청크 확인, 22:21 PHT):
  - 네 탭 모두 탭 줄 [친구 추가] 1개(x=386·폭 36 / 화면 430), 친구 탭만 [관리], 대화 탭만 [그룹 만들기] PASS.
  - 대화 목록: 김양수·zxzx11·이칠수·Hhhhh111·dddd 「?」, 친구 김선희·Shawn Park·메인관리자 없음 — 21:47 DB 대조와 동일 PASS. 통화 목록 q테스트1 22·김양수 3·zxzx11 1 「?」(모두 친구 아님) PASS.

### 15-4. 「보관함 차단 해제 시 대화방 미복원」 재조사 (Owner 2026-10-25 22:21 PHT 지시 · 결론: 결함 아님, 이전 보고 정정)
- 재현(Samsung q테스트1, Production `bc298ce3c`, 22:23~22:28 PHT, 앱 fetch 기록·DevTools Network):
  1. 방 바 [차단] → 앱 재시작(방 목록에서 빠짐, `wInList=false`) → 보관함 > 차단 친구 > 차단해제(22:24:44): `DELETE /relations/block` 응답 `restoredRoomIds` 에 방 포함, 이어진 `bootstrap?tier=critical`·`home-sync` 응답에 방 포함 → 목록에 즉시 복귀(`wInList=true`), 목록에서 눌러 진입 정상.
  2. 대조: 차단 없이 같은 방을 앱 내비게이션으로 진입 정상.
- 이전(22:15) 「방 주소로 들어가면 홈으로 되돌아감」은 시험 방법의 부작용: 대화 목록 화면에서 `location.href` 로 문서를 새로 불러오면 앱 수명주기가 직전 화면을 복원(`[dibay-lifecycle] doc_reset reason=same_epoch_reload_restore`). 사용자 경로가 아님.
- `hidden_at` 잔존: 차단 숨김(`participant-block-hide.ts:108`)이 쓰지만 앱 코드·운영 DB 목록 함수 어디서도 읽지 않음(목록 기준은 `blocked_hidden_at` 뿐, 해제 시 정상 삭제). 동작 영향 없음 — 이전 「hidden_at 이 남아 미복원」 보고는 틀림.
- 재조사 중 확인된 실제 결함(보고만): 방 상단 바에서 [차단]하면 홈 대화 목록에서 그 방이 빠지지 않음(22:23:01 차단 후 `wInList=true`, 앱 재시작 후에야 빠짐). 홈의 차단(`toggleBlock`)은 응답 `hiddenRoomIds` 로 `remove_room` 하지만 방 바 차단은 하지 않음.
- 시험 상태: 차단 해제 완료(활성 차단 0건).

## §16. 친구 소개(상태 메시지) 표시 → 「상태」 (Owner 승인 · a59fc35c0 · Samsung·iPhone·태블릿 PASS)
- 지시: 친구 프로필 소개를 왜 뺐나 — 소개는 상대 상태를 확인하는 용도. 작성 안 하면 안 나오는 것은 맞지만, 친구 목록·상대 프로필에 보이는 완성된 형태.
- 증거(Samsung q테스트1, 22:28~22:29 PHT; zxzx11 소개 「한줄 두줄 입력 방식 입니다.」, `/api/community-messenger/friends` 응답에 bio 포함 확인):
  - 친구 목록 행: 2행이 접속 상태(「자리 비움」·「마지막 접속 …」)뿐, 소개 없음. `friend-list/CommunityMessengerFriendRow.tsx` 주석 「bio 기본 2행은 사용하지 않는다」 — 2026-07-30 `17d5e02ba`(텔레그램 밀도 맞춤)에서 제외. 이번 세션 변경 아님.
  - 상대 프로필 시트(대화방 머리글 사진 → `MessengerFriendProfileSheet` context=roomHeader): 이름·「친구」 칩·통화 버튼만. 시트는 예전부터 `profile.subtitle`(@아이디 아닌 경우)만 표시하고 `profile.bio` 는 그리지 않음 + 이 경로에서 받은 프로필은 `bio: null`·`subtitle` 없음(방 스냅샷 상대 프로필 labels-only).
  - 친구 행 빠른 팝업(길게 누름)은 bio 를 표시(§13 유지).
  - 내 프로필 카드(친구 탭 상단)는 내 소개 표시 중.
- 설계:
  1. 친구 목록 행 2행: 소개가 있으면 소개(1줄 말줄임), 없으면 지금처럼 접속 상태. 접속 상태는 사진의 접속 점으로 계속 보임.
  2. 상대 프로필 시트(모든 진입 경로 — 대화방 머리글·친구 행·검색 결과·통화 기록): 사진 → 이름 → @아이디 → 소개 카드(따옴표 없이 본문, 최대 3줄, 연한 배경 상자) → 접속 상태 한 줄 → 관계 칩 → 행동 버튼. 소개가 없으면 소개 카드만 생략.
  3. 데이터: 시트가 받은 프로필에 bio 가 없으면 홈 친구 목록(bio 포함)에서 채우고, 친구가 아니면 기존 `users/resolve` 로 1회 조회(읽기만). 방 스냅샷 경로는 서버가 상대 bio 를 함께 내려줌.
  4. 바뀌지 않는 것: 소개 작성·저장, 서버 DB, 통화·채팅 동작.
- 실기기 검증: Samsung·iPhone·태블릿 — 소개 있는 친구(zxzx11)·없는 친구(메인관리자) 각각 친구 목록 행·프로필 시트(대화방 머리글·친구 행 길게 누름).
- Owner 승인(2026-10-25 22:31 PHT): 「소개 → 상태로 전체를 확인해서 변경, 구현 승인」.
- 구현 `a59fc35c0`: 프로필 bio 문구 「소개」→「상태」(마이페이지 요약 빈 상태·설정 설명·계정 탭 캡션·모바일 내비 설명·상단 부제·셀프 프로필 빈 상태, ko/en; 편집 입력란은 기존 「나의 상태」; 방·모임·매장 소개는 다른 뜻이라 유지) · 친구 목록 2행 상태 우선 · 상대 프로필 시트 @아이디·「상태」 상자·접속 상태 줄(받은 프로필에 없으면 `users/resolve?targetUserId=` 1회, 응답에 bio 추가). 로컬: typecheck PASS · vitest 536파일 중 기존 무관 실패 4파일(image-auto-save 2·마이페이지 캐시 삭제 2 — 변경 전 코드에서도 동일 실패 확인) · eslint 오류 0.
- Samsung(q테스트1, Production `a59fc35c0` READY, 22:42~22:43 PHT): 친구 목록 zxzx11 2행 「한줄 두줄 입력 방식 입니다.」, 나머지 4명 「오프라인」 PASS. 대화방 머리글 → 프로필: 「zxzx11 | @zxzx11 | 상태 | 한줄 두줄 입력 방식 입니다. | 자리 비움 | 친구」 PASS. 상태 없는 메인관리자: 「메인관리자 | @aaaa | 오프라인 | 친구」(상태 상자 생략) PASS.
- 태블릿(zxzx11, 22:43~22:44 PHT): 친구 목록 q테스트1 「아름다운 가계」·참이슬 「dddssd」, 나머지 접속 상태 PASS. 분할 화면 대화방 머리글 → 프로필: @qqqq · 상태 「아름다운 가계」 · 온라인 · 친구 PASS.
- iPhone(w테스트1, 앱 재시작 22:46:28 PHT 로드 — 새 청크 확인, 22:48 PHT): 친구 목록 Shawn Park 「good」, 김선희·메인관리자·BK THE 「오프라인」 PASS. 대화방 머리글 → 프로필 「Shawn Park | @in5453 | 상태 | good | 오프라인 | 친구」 PASS.

## §17. 남은 항목 전체 정리 · 진행 순서 (2026-10-25 22:52 PHT · Owner 「전체를 확인해서 진행 순서를 정리해서 진행」)
§1~§16 전체를 다시 대조했다. 완료(PASS)는 각 절에 기록되어 있고, 여기는 **남은 것만**이다.

| 순서 | ID | 내용 | 종류 | 근거 | 진행 방식 |
|---|---|---|---|---|---|
| 1 | R-1 | 방 상단 바 [차단] 후 대화 목록에서 방이 안 빠짐(앱 재시작 후에야 빠짐) | 실제 결함 · 메신저 | §15-4 22:23 `wInList=true` | 바로 수정(§15 승인 범위의 동작 결함) → 실기기 |
| 2 | R-2 | 상대가 보낸 친구 요청이 대기 중인 방: 상단 바가 「친구가 아닌 사용자예요」+[차단]만 — [수락]·[거절] 없음 | 결함 의심 · 메신저 UI | §15 구현 메모(incoming_pending 은 친구 추가 숨김) | 실기기 재현 → 시안 → 승인 → 구현 |
| 3 | V-1 | 미검증 실기기 묶음(코드 변경 없음): 통화 중(busy, 태블릿 3번째 기기) · 영상 수락·연결 · 앱 안 배너 그룹 글·미리보기 끔 · 방 메뉴 요청 취소·수락(FR-12) · 받은/보낸 요청 카드(S-16) · 「친구 추가하면 예전 대화가 나타남」 재현 | 검증 | §10·§12·§14-1·§14-8·§14-11 NOT_PROVEN | Owner 가 iPhone 들고 한 회차로 |
| 4 | R-3 | 통화 버튼이 막혀 있을 때 이유 안내 없음 · 차단/거절 상대 통화 목록 재다이얼 버튼이 눌리는 모양 | 결함 · 통화 UI | §14-7 보고, §15-3 캡처 | 통화 규정: 영향 분석 문서 → 승인 → 통화 단독 |
| 5 | V-2 | W-9 통화 안내 문구 C-1~C-5 실기기 | 검증 · 통화 | §10 NOT_PROVEN | 통화 시험 회차에 포함 |
| 6 | A-1 | F-12 친구 DB 함수 보완(동시 요청 잠금·오류 원문 제거 등) | 운영 DB | §4 | 변경안 문서 → Owner 승인 → 적용 |
| 7 | A-2 | N-1 Android 수신 화면 · N-2 통화 안내 네이티브 · N-3 `bcad9b4b7` 회귀 | 네이티브 | §6 | 상세 문서 → Owner 승인 → Cursor 구현·빌드 |
| — | E-1 | A1b 늦은 링 · L-CALL · L-ARCH · N-SOUND · SIDE-01·03·05·07·09 · S-7 검색 카드 저절로 닫힘 | 증거 대기 | §8·§14-1 | 재발 증거 확보 전 수정 금지 |
| — | E-2 | F-13 단방향 친구 · F-14 전화번호 친구 찾기 | 정책 범위 밖 | §4 | 기록 유지 |
| — | X-1 | 기존 테스트 실패 4파일(image-auto-save 2 · 마이페이지 캐시 삭제 2) | 무관 기존 실패 | 변경 전 코드 동일 실패 | 보고만 |
| — | X-2 | 시험 잔여: q 쪽 w 방 `hidden_at`(미사용 값) · w 쪽 q 방 `is_archived=true` | 운영 데이터 | §15-3·§15-4 | 동작 영향 없음, 정리하려면 데이터 변경 승인 |

- 원칙: 한 번에 한 원인 · 메신저/통화/DB/네이티브 분리 커밋 · 실기기 PASS 전 다음 단계 금지(통화).

### 17-1. R-1 구현 (`40b08296b` · 메신저 단독)
- 방 화면 차단(상단 바·메시지 메뉴) 성공 → 응답 `hiddenRoomIds` 로 홈 캐시(full·minimal·critical)·방 스냅샷 정리 + bus `cm.home.remove_room`(reason `blocked_hidden`). 로컬: typecheck PASS · 메신저 vitest PASS(기존 image-auto-save 2파일) · eslint 오류 0.

- R-1 실기기(Samsung q, Production `40b08296b` READY, 23:00 PHT): w 방 상단 바 [차단] 23:00:15 → 대화 목록 복귀 시 w 방 없음(`wInList=false`, 이전 결함 시 true) PASS. 보관함 해제 23:00:38 → 방 복귀 PASS. 원복: 차단 0 · 대기 요청 0.

### 17-2. R-2 원인 확정 · 설계 (Owner 승인 · 45ebb2ba5·7d13d5353·81d3731d1 · Samsung·iPhone PASS)
- 재현(22:53~22:54 PHT): w→q 요청 생성(`dda576aa` pending) → Samsung 전역 팝업 정상(거절·수락·X). X 로 닫고 w 방 진입 → 상단 바 「친구가 아닌 사용자예요 · [친구 추가] [차단]」. 서버 방 스냅샷 `peerFriendshipState=none` · `friendshipDirection=none`. 시험 후 요청 cancel 로 원복.
- 원인: `resolveFriendshipPair`(`lib/community-messenger/friendship/resolve-friendship-pair.ts:116-140`)가 `user_social_relations` 친구 여부만 보고 `accepted`/`none` 만 반환 — `community_friend_requests` 대기 요청을 보지 않음. 같은 이유로 **보낸 요청도** 방에 다시 들어가면 「친구 추가」로 보인다(21:23 확인한 「요청 보냄」 바는 버튼 직후 화면이 스스로 바꾼 값).
- 영향 범위 확인: `resolveFriendshipPair` 는 방 스냅샷(`service.ts:16122`)과 `friendship-resolver.ts`(통화 권한 `friendshipPreload`)가 사용 → **판정 함수 자체는 바꾸지 않는다.** `peerFriendshipState`·`friendshipDirection` 을 쓰는 화면은 방 메뉴·상단 바·방 시트뿐(통화 화면 없음).
- 설계:
  1. 서버(메신저): 방 스냅샷 조립에서만 두 사람 사이 `community_friend_requests` pending 을 1회 조회해 `peerFriendshipState=pending`·`friendshipDirection=outgoing_pending|incoming_pending`·`pendingFriendshipRequestId` 채움. 통화 권한 경로 무변경.
  2. 방 상단 바:
     - 보낸 요청: 「친구 요청을 보냈어요 · 수락을 기다리는 중」 + [요청 취소](보조) · [차단](빨간 테두리).
     - 받은 요청: 「w테스트1님이 친구 요청을 보냈어요」 + [수락](녹색 채움, 주 버튼) · [거절](보조) + 아래 작은 [차단] 글자 버튼.
  3. 방 메뉴(점 3개)의 친구 항목도 같은 상태 사용(FR-12).
- 실기기: 보낸 요청 → 방 재진입 「요청 보냄」 유지 · [요청 취소] · 받은 요청 → 방 [수락]/[거절] 각각 → 결과(친구 칩·바 사라짐 / 거절 후 바) — Samsung·iPhone.
- 구현(Owner 승인 2026-10-25 23:01 PHT, 메신저 단독): `45ebb2ba5`(서버 방 스냅샷에만 pending 반영 · 바 받은 요청 [수락][거절]+차단 / 보낸 요청 [요청 취소][차단]) · `7d13d5353`(실기기 23:13 발견: 방 재진입이 메모리 스냅샷을 먼저 써 직전 「받은 요청」 유지 → 진입 시 `/friend-requests` 1회로 맞춤, 대기 요청 사라지면 서버 스냅샷 재조회) · `81d3731d1`(실기기 23:21 발견: [친구 추가] 후 [요청 취소] 안 나옴 → 응답 request.id 즉시 사용). 로컬: typecheck PASS · 메신저 vitest PASS(기존 image-auto-save 2) · eslint 오류 0.
- 실기기(Production `81d3731d1` 까지, 23:11~23:28 PHT, Samsung q / iPhone w):
  - 받은 요청(w→q): Samsung 전역 팝업 정상 → X → 방 바 「w테스트1님이 친구 요청을 보냈어요 | 수락 | 거절 | 차단」 PASS → [거절] 23:12:20 → 「w테스트1님의 친구 요청을 거절했습니다.」·바 「친구 아님」·DB rejected PASS.
  - 보낸 요청(q→w): 방 바 「요청 보냄 | 요청 취소 | 차단」, 방 나갔다 재진입해도 유지 PASS(23:20).
  - iPhone 받은 요청: 「q테스트1님이 친구 요청을 보냈어요 | 수락 | 거절 | 차단」 PASS → [수락] 23:21:15 → DB accepted·양쪽 friend 활성·iPhone 바 사라짐, Samsung 방 바도 실시간 사라짐 PASS.
  - [요청 취소]: 확인 창 「w테스트1님에게 보낸 친구 요청을 취소할까요?」 [유지][요청 취소] → 취소 23:23:18 → 바 「친구 아님」·DB cancelled PASS. [친구 추가] 1.5초 뒤 [요청 취소] 즉시 표시 PASS(23:28).
  - 원복: 대기 요청 0 · 친구 0 · 차단 0.

### 17-3. V-1 미검증 실기기 묶음 결과 (2026-10-25 23:31~23:46 PHT · Samsung q / iPhone w(Owner 조작) / 태블릿 zxzx11)
| 항목 | 결과 | 증거 |
|---|---|---|
| 통화 중(busy) | PASS | Samsung→iPhone 음성 23:32:09 → 수락 23:32:15(active). 태블릿→iPhone 23:32:50 세션 즉시 `cancelled/peer_busy`, 태블릿 「상대방 통화 중 · 상대방이 다른 통화 중입니다…」, 두 번째 통화 푸시 0건(iPhone 안 울림), 첫 통화 유지 → 23:33:27 `ended_by_caller`(「음성 통화 · 1분 10초」) |
| 영상 통화 수락·연결 | PASS | Samsung 방 메뉴 「영상 통화」 23:34:04 → iPhone 수락 23:34:15 → 양쪽 영상·품질 「좋음」 → 23:34:43 `ended_by_caller` |
| 앱 안 배너 그룹 글 | 결함 → 수정 → PASS | 23:35 「테스트 / V1 group banner check」(보낸 사람 누락), 23:36 두 번째 글이 **직전 글**로 표시. 원인: 배너가 쓰던 방 bootstrap 프리패치가 서버 메모리 2.5초·엣지 swr 30초 캐시로 직전 메시지 반환(fetch 기록). `89e1e3f1f` 최신 메시지는 캐시 없는 `messages?latest=1`, 방 정보는 홈 목록 행. 재시험 23:45 「테스트 | q테스트1: … check 3」·「… check 4」 각 0.7초 PASS |
| 앱 안 배너 미리보기 끔 | PASS | w `chat_preview_enabled=false` → 1:1 글 23:45:37 → 배너 「q테스트1 / 새 메시지」, 서버 알림 동일. 설정 원복(true) 확인 |
| 방 메뉴 친구 항목(FR-12) | PASS | q→w 요청 후 Samsung 메뉴 「친구 요청됨 · 요청 취소」, iPhone 메뉴 「받은 친구 요청 수락」 |
| 받은·보낸 요청 카드(S-16) | PASS | Samsung 친구 탭 「친구 요청 · 보낸 요청 · w테스트1 · 수락 대기 1」, iPhone 「받은 요청 1 · q테스트1 · 확인」, 탭 줄 [친구 추가] 배지 1. 시험 요청 취소로 원복 |
| 「친구 추가하면 예전 대화가 나타남」 | 증거 대기(E-1) | 재현 조건 불명확 — S-13(상위 30방 캐시) 수정 이후 재발 보고 없음 |
| 관찰 | 증거 대기(E-1) | 태블릿에서 대화 행을 눌렀을 때 약 8초 흰 화면 후 이전 방으로 복귀 1회(23:31:12). 같은 행 재시도 즉시 열림 — 재현 안 됨 |

### 17-4. R-3 통화 버튼 이유 안내 — 통화 규정 영향 분석 (Owner 승인 · 메신저 def98802b · 통화 6f6b6f78d · 불가 상대·정상 통화 행렬 실기기 PASS)
- 현재(코드):
  - 대화방 머리글 음성 버튼 `CommunityMessengerRoomPhase2Header.tsx:128,560` — `headerVoiceDisabled = roomUnavailable || outgoingDialLocked` 이면 `disabled`(흐림 45%), 눌러도 반응·이유 없음. `roomUnavailable` 은 §14-5 차단·거절(`directMessageDenied`) 포함.
  - 통화 목록 재다이얼 `CommunityMessengerCallRow.tsx:337-342` — 다른 통화 진행 중(`globalRedialBlocked`)만 막음. 차단·거절 상대(빨간 금지 배지 행)도 눌림 → 발신 확인 → 서버 거부.
- 바꾸는 것(웹 표시·누름 처리만):
  1. 머리글 음성 버튼: `disabled` 대신 흐린 모양 + 눌렀을 때 이유 스낵바. 이유 = 상대가 거절(「상대가 친구 요청을 거절해 통화할 수 없어요」) / 내가 차단(「차단을 해제하면 통화할 수 있어요」) / 그 밖의 불가(「지금은 통화할 수 없어요」 — 상대 차단 사실은 노출 안 함) / 발신 진행 중(「통화를 연결하고 있어요」).
  2. 방 메뉴의 음성·영상 통화 항목도 같은 판정·같은 안내.
  3. 통화 목록: 대화·통화 불가 행(§15-3 `unavailablePeerIds`)의 재다이얼 버튼을 흐린 모양으로, 누르면 같은 이유 스낵바(발신 확인 창 열지 않음).
- 바꾸지 않는 것: 발신 시작 함수·세션 생성·권한 서버(`direct-call-permission.ts`)·VoIP/FCM 발송·수신 화면·CallKit/Android·종료/취소·통화 기록·네이티브. 서버 거부는 그대로 최종 방어선.
- 영향 경로: 발신 진입 3곳(머리글·방 메뉴·통화 목록)의 「누름」 처리만. 판정은 기존 값(`roomUnavailable`·`directMessageDenied`·`members[].blocked`·`unavailablePeerIds`·`outgoingDialLocked`).
- 설치된 구 바이너리 호환: 웹만 — 네이티브 브리지 호출 무변경.
- 회귀 위험: 판정 오류로 정상 상대 발신이 막힐 수 있음 → 「알 때만」 값만 사용, 모르면 지금처럼 발신 허용. 발신 진행 중 연타 방지(`outgoingDialLocked`)는 유지.
- 롤백: 통화 단독 커밋 되돌리기.
- 실기기 검증(통화 규정 5번 최소 행렬 포함): 정상 상대 Samsung↔iPhone 음성·영상 발신 수신(회귀 없음) · 거절 상대 머리글/메뉴/통화 목록 누름 → 안내, 세션 생성 0건(DB) · 차단 상대 같은 항목 · 차단 해제 후 정상 발신.
- 구현: 메신저 `def98802b`(홈 공유 값 `blockedByMePeerIds`, 동작 무변경) · 통화 단독 `6f6b6f78d`(머리글·방 메뉴·통화 목록 이유 안내, `resolveDirectCallUnavailableReasonKey`). 네이티브 무변경. 로컬: typecheck PASS · 통화/메신저 vitest PASS(기존 image-auto-save 2) · eslint 오류 0. U-8 계약 테스트는 「불가 상대만 안내, 그 밖은 발신 확인 그대로」로 갱신.
- 실기기(Samsung q, Production `6f6b6f78d` READY, 2026-10-26 00:00~00:03 PHT):
  - 상대 거절: 머리글 음성 흐림 → 누름 「상대가 친구 요청을 거절해 통화할 수 없어요」(발신 확인 없음) PASS · 방 메뉴 음성·영상 흐림 → 같은 안내 PASS · 통화 목록 재다이얼 흐림 → 같은 안내, 확인 창 없음 PASS.
  - 내가 차단: 통화 목록 재다이얼 → 「차단을 해제하면 통화할 수 있어요」 PASS(차단 시 방은 숨겨져 머리글·메뉴 경로 없음).
  - 그 사이 통화 세션 생성 0건(DB, 15:58Z 이후). 원복: 요청 cancelled · 친구 0 · 차단 0.
  - 남음: 정상 상대 통화 행렬(머리글 음성·메뉴 영상·통화 목록 재다이얼·거절·벨 중 취소·iPhone→Samsung·종료 직후 재발신).
- 확인 중 발견(새 항목, 보고):
  - R-4 방 화면 관계 값이 오래됨: 앱 시작 시 홈이 미리 받은 방 데이터(거절 이전)를 방 진입 때 다시 확인하지 않음 → 거절(23:58:55) 후 1분 넘게 방 바 「친구 아님」·통화 버튼 정상 모양(`directMessageDenied:null`), 서버는 `rejected_by_peer`. 앱 재시작 후에는 정확. R-2 는 대기 요청만 진입 시 보정, 거절·차단은 미보정.
  - R-5 상대 거절 상태의 방 메뉴 「친구 추가」: 방 바는 버튼 없음(§15)인데 메뉴에는 눌리는 모양으로 남음(누르면 서버 `request_rejected`).
- 정상 상대 통화 행렬(Production `6f6b6f78d`, 2026-10-26 00:04~00:11 PHT, Samsung q ↔ iPhone w(Owner 조작), 서버 시각 DB):

| # | 시험 | 세션 | 결과 |
|---|---|---|---|
| M1 | Samsung 대화방 머리글 음성 → iPhone 받기 → Samsung 종료 | 00:04:37 → 수락 00:04:46 → `ended_by_caller` 00:05:26 | PASS |
| M2 | Samsung 방 메뉴 영상 → iPhone 받기 → 종료 | 00:06:16 → 00:06:22 → 00:06:49 | PASS |
| M3 | Samsung 통화 목록 재다이얼(음성) → 발신 확인 창 정상 → iPhone 거절 | 00:07:32 → `declined` 00:07:40 | PASS |
| M4 | Samsung 통화 목록 재다이얼(영상 행) → 벨 중 Samsung 취소 | 00:08:10 → `canceled` 00:08:41 · ring 푸시 00:08:11 · cancel 푸시 00:08:41 sent · 이후 ring 0 | 서버 PASS(재울림 여부 Owner 확인). 첫 취소 탭은 영상 화면 종료 버튼 위치 차이로 빗나감(시험자 조작) |
| M5 | iPhone → Samsung 음성, Samsung 수신 화면 「음성 통화 수신」 → 수락 → Samsung 종료 | 00:09:54 → 00:10:08 → `ended_by_callee` 00:10:33 | PASS |
| M6 | 종료 19초 뒤 Samsung 재발신 → iPhone 받기 → 종료 | 00:10:54 → 00:10:59 → `ended_by_caller` 00:11:24 | PASS |

  - 통화 중(busy)·무응답 타임아웃은 같은 날 §17-3(23:32)·§14-10(20:44~20:47)에서 PASS.
  - 관찰: 00:03:12~00:03:47 Samsung 에 사람 터치 15회(logcat InputDispatcher) — 그 사이 q→w 통화 2건 생성·즉시 취소(`cae47d78`·`f848dca7`, 발신자 취소). 시험자 조작 아님 → 수동 조작으로 판단, 결함 아님(Owner 확인 요청).

### 17-5. R-4 · R-5 원인 확정 · 설계 (2026-10-26 PHT · 승인 대기 · 구현 없음)

**R-4 방 화면 관계 값이 오래됨 — 원인 3가지 (코드·실기기 확인)**

1. 진입 때 서버에 다시 묻지 않음: `use-messenger-room-bootstrap-lifecycle.ts` 는 시드 스냅샷(홈 미리 받기·메모리 캐시 `TTL_MS=60_000`)이 있으면 타임라인 미완·`membersDeferred`·`bootstrapEnrichmentPending` 일 때만 refresh, 그 밖은 `return`. 실기기(2026-10-26 00:13 PHT, Samsung q): 거절 직후 방 진입 → 요청은 `/friend-requests`·`messages?after=` 뿐, 방 데이터 요청 0건 → 바 「친구 아님」, 서버는 `rejected_by_peer`.
2. 조용한 refresh 는 관계 값을 안 바꿈: `refresh(true)` 는 항상 `snapshotTier=silent_delta`(서버 DB 2쿼리 — 방·내 참가자만, `service.ts` 14805). 병합 `merge-community-messenger-silent-delta.ts` 도 방 포인터만 덮음 → `peerFriendshipState`·`directMessageDenied`·`members[].blocked`·`pendingFriendshipRequestId` 는 그대로. 친구 실시간 동기화(`friendship_sync`)·`social_sync`·R-2 의 `vm.refresh(true)` 모두 이 경로라 관계 값을 못 고침.
3. 거절은 실시간 신호가 없음: 방 동기화는 `user_social_relations`(owner=나)만 구독. 거절·요청 취소는 `community_friend_requests` 만 바뀌어 방에 신호 0건.
- 덧붙여 전체 부트스트랩도 엣지 캐시(`s-maxage=5, stale-while-revalidate=30`) 를 거쳐 최대 수십 초 오래될 수 있음 → 전체 refresh 로 바꾸는 것도 근본 해결이 아님.

**R-4 설계 (메신저 단독)**

- 서버: `service.ts` 방 스냅샷의 관계 계산 블록(친구 판정 + 대기 요청 + 차단·거절)을 함수 하나 `resolveDirectRoomPeerRelation(sb, viewerId, peerId)` 로 꺼내 스냅샷과 새 API 가 **같은 함수**를 쓴다(판정 원천 1곳). 반환: `peerFriendshipState`·`friendshipDirection`·`pendingFriendshipRequestId`·`directMessageDenied`·`peerBlockedByMe`.
  - 통화 권한 `canStartDirectCallBetweenUsers`·`directCallGate`·`resolveFriendshipPair` 는 **꺼내지도 바꾸지도 않는다**(스냅샷 안 그대로).
- 새 API `GET /api/community-messenger/rooms/[roomId]/peer-relation` — `no-store`·private, 일반 1:1 방 참가자만, DB 4쿼리(현 스냅샷 블록과 같은 양).
- 클라이언트: 일반 1:1 방에서 이 API 를 부르고 결과를 스냅샷·방 캐시에 병합(`patchRoomSnapshotPeerRelation`).
  - 부르는 때: ① 방 진입(첫 화면 그린 뒤, 화면을 막지 않음) ② `friendship_sync`·`social_sync` 신호 ③ 앱 복귀(방이 열린 채 foreground).
  - R-2 진입 보정(PeerNotice·방 메뉴의 `/friend-requests` 조회 2곳)은 이 API 로 대체·삭제 → 진입 요청 수는 지금과 같거나 줄어듦.
- 화면 영향: 바(§15)·입력창 막힘·방 메뉴가 서버 값으로 맞춰짐. 머리글·메뉴 통화 버튼 흐림은 이미 `directMessageDenied`(R-3)를 읽으므로 **통화 파일 변경 없이** 함께 맞춰짐.
- 통화 규정 판단: 통화 파일(`call*`·`call-ui/**`·`direct-call-permission`·push·네이티브) 무변경, 발신 서버 게이트 무변경. 바뀌는 것은 통화 버튼이 읽는 메신저 값의 신선도뿐 → 메신저 단독 커밋. 그래도 실기기에서 통화 버튼 흐림·정상 상대 발신 1회는 확인한다.
- 성능: 방 진입 핫패스에 GET 1건 추가(비차단, 첫 페인트 뒤). R-2 조회 2건을 대체해 순증 0~-1. `verify:parity-gates` 해당 항목만 1회.
- 회귀 위험: 병합이 다른 필드를 덮으면 안 됨 → 관계 5필드만 덮는 단위 테스트. API 실패 시 지금 값 유지.
- 롤백: 커밋 되돌리기(DB 변경 없음).

**R-5 방 메뉴 「친구 추가」 — 원인 (코드 확인)**

- `CommunityMessengerRoomPhase2OneToOneDotMenu.tsx`: `relation`(`mapRelationFromSnapshot`)과 `disableFriendRequest`(:520 `peerProfile.blocked || friendAddCta.kind==="blocked" || busy`)가 `directMessageDenied` 를 보지 않음 → 상대 거절이면 `relation="none"` 그대로 눌리는 「친구 추가」(서버는 `request_rejected` 로 거부).
- 방 바(§15)는 `rejected_by_peer` 면 추가 버튼을 안 보임 → 같은 화면에서 서로 다름.

**R-5 설계 (메신저 단독, R-4 와 같은 커밋)**

- 방 메뉴는 `directMessageDenied` 가 있으면(상대 거절·차단) 친구 추가/요청 취소/수락 줄을 **보이지 않는다**(방 바와 같은 규칙). 상대 거절 해제(→cancelled) 뒤에는 R-4 갱신으로 다시 보임.
- 판정은 바와 같은 함수(`community-messenger-room-phase2-peer-notice-logic.ts`)에서 가져와 두 곳이 갈라지지 않게.

**실기기 검증 (Samsung q · iPhone w · 태블릿)**

- R-4: 방을 연 채/홈 미리 받기 직후 w 거절 → q 방 진입 즉시 바 「상대가 거절」·입력 막힘·통화 버튼 흐림 / w 거절 해제 → 재진입 「친구 아님」 / 방 연 채 w 수락·차단 해제·친구 삭제 → 수 초 안에 바 변경 / 정상 친구 방 진입 시 표시 변화 없음.
- R-5: 거절 상태 방 메뉴에 「친구 추가」 없음, 해제 후 다시 보임.
- 회귀: 정상 상대 머리글 음성 발신 1회(세션 생성·수신 화면), R-2 받은/보낸 요청 표시.

- 시험 데이터 원복(2026-10-26 PHT): q→w 요청 9e658188 거절 해제 → `cancelled` · 친구 0 · 차단 0.

**§17-5 구현·실기기 결과 (Owner 승인 · 메신저 단독 `99d4fab57`·`a2e3d5c6b` · Production 확인 후 시험, 2026-10-26 00:32~00:47 PHT)**

- 구현: 관계 판정 `resolveDirectRoomPeerRelation`(방 스냅샷·새 `GET rooms/[roomId]/peer-relation` no-store 공용) · 방 진입·전역 친구 요청 피드 동기화(`cm:friend-requests-synced`)·친구 실시간 신호 때 관계 값만 다시 받아 스냅샷·방 캐시 병합 · R-2 `/friend-requests` 진입 조회 2곳 대체 · 방 메뉴는 `directMessageDenied` 면 친구 줄 숨김. 통화 파일·통화 권한 계산·네이티브 무변경.
- 시험 중 발견·수정(`a2e3d5c6b`): 방을 연 채 상대가 친구 삭제 → 관계는 none 인데 수락 때 넣은 표시값(`peerRelationLabel=mutual_friend`)이 남아 바 미표시(00:34). API 가 같은 표시값 함수(`resolvePeerRelationLabel`)로 함께 내려 덮음(방 스냅샷 경로는 그대로).
- 로컬: typecheck PASS · 메신저 vitest 487 파일 PASS(기존 image-auto-save 2 실패 그대로) · eslint 오류 0.

| # | 기기 | 시험 | 결과 |
|---|---|---|---|
| 1 | Samsung q | 앱 재시작·홈 미리 받기 뒤 w 거절(00:32:59) → 방 진입 | 방 데이터 재요청 없이 `peer-relation` 1건 → 바 「상대가 거절」·입력 막힘·통화 흐림 PASS |
| 2 | Samsung q | 방 메뉴(R-5) | 「친구 추가」 없음, 음성·영상 흐림 PASS |
| 3 | Samsung q | 방을 연 채 w 거절 해제(00:33:25) | ~1초 뒤 「친구 아님」+[친구 추가]·입력·통화 정상 PASS |
| 4 | Samsung q | 방에서 [친구 추가] → 바 「요청 보냄」·메뉴 「친구 요청됨 · 요청 취소」 → w 수락(00:34:08) | 바 사라짐 PASS |
| 5 | Samsung q | 방을 연 채 w 친구 삭제(00:42:59, `a2e3d5c6b`) | 「친구 아님」 바 복귀 PASS (`99d4fab57` 에서는 FAIL → 위 수정) |
| 6 | Samsung q | 머리글 음성 발신 → 벨 중 취소 | 세션 00:43:26 생성 → `cancelled` 00:43:42 PASS |
| 7 | iPhone w | 앱 안 이동으로 방 진입(q 거절 00:44:27 뒤) | 바 「상대가 거절」·음성 버튼 `aria-disabled`·메뉴 「친구 추가」 없음 PASS |
| 8 | iPhone w | 방을 연 채 q 거절 해제(00:45:40) | ~1초 뒤 「친구 아님」+[친구 추가]·음성 버튼 정상 PASS |
| 9 | 태블릿 zxzx11 | w 요청(중앙 팝업 → X) 뒤 방 진입 | 바 「친구 요청을 보냈어요」 [수락][거절] PASS |
| 10 | 태블릿 zxzx11 | 방을 연 채 w 요청 취소(00:47:07) | 「친구 아님」+[친구 추가]·[차단] 복귀 PASS |

- 남은 위험: 상대가 나를 차단·차단 해제하는 경우는 내 쪽에 실시간 신호가 없어 방 재진입·앱 복귀 때 맞춰짐(설계 범위). iPhone 은 DOM 확인(화면 캡처 아님).
- 시험 데이터 원복: 요청 9e658188·dda576aa·325d0ae4 모두 `cancelled` · q↔w·w↔zxzx11 친구·차단 0. 시험 통화 1건(취소).
- 설계 밖 추가 `a2e3d5c6b`(방 바 표시값 `peerRelationLabel` 을 peer-relation 응답에 포함): Owner 유지 승인(2026-10-26 PHT). 미실행 `verify:parity-gates` 는 NOT_PROVEN 유지.

### 17-6. A-1 (F-12) 친구 DB 함수 보완 — 원인 확정 · 설계 (2026-10-26 PHT · 운영 DB 변경 · 승인 대기 · 적용 없음)

근거: 운영 DB 읽기 전용 조회(함수 정의·권한·정책·제약·데이터 건수, 2026-10-26 00:5x PHT) + 코드 확인. F-12 항목별 판정:

| F-12 항목 | 확인 결과 | 판정 |
|---|---|---|
| ① 클라이언트 status 직접 수정(RLS) | `community_friend_requests`: authenticated·anon 권한 **SELECT 만**(INSERT/UPDATE 정책은 있으나 권한이 없어 동작 안 함). 반면 **`user_social_relations`: authenticated·anon 에 INSERT·UPDATE·DELETE·TRUNCATE 권한** + 정책 `owner=auth.uid()` ALL → 로그인 사용자가 API 없이 직접 「친구」 행 생성·차단 행 삭제 가능(친구 요청·차단 규칙 우회). TRUNCATE 는 RLS 적용 대상이 아님. 앱 코드의 이 표 쓰기는 모두 서버(service role) — 클라이언트 직접 쓰기 0건(코드 검색) | **결함 확정 → 변경** |
| ② 수락 시 차단 무시 | `cm_accept_friend_request` 는 차단을 확인하지 않고 `ON CONFLICT (owner,target) DO UPDATE SET relation_type='friend'` → 같은 쌍의 **차단 행을 친구 행으로 덮어씀**. 차단해도 대기 요청은 남고(`blockUserSocial` 은 요청을 건드리지 않음) 받은 요청 목록도 차단을 거르지 않음 → A 가 B 에게 요청 후 A 가 B 차단 → B 가 수락하면 A 의 차단이 사라지고 친구가 됨 | **결함 확정(코드) · 운영 발생 0건 → 변경** |
| ③ 동시 요청 잠금 | `cm_send_friend_request` 잠금 없음. 같은 방향 연타 → UNIQUE 충돌 → `friend_request_send_failed`(사용자에게 「실패」). 양방향 동시 → 대기 2건 가능. 운영 이중 대기 0건 | **결함(경합 창) 확정 · 발생 0건 → 변경** |
| ④ 오류 원문 노출 | 함수가 `detail: SQLERRM` 을 돌려주지만 서버 파서가 `error` 코드만 클라이언트에 전달(`cm-mutual-friend-request.ts`) | **노출 없음 → 변경 안 함** |
| ⑤ 친구 검사 `is_active` | 비활성 친구 행 0건, 만드는 경로 없음(비활성은 차단 해제 이력만) | **결함 아님 → 변경 안 함** |
| ⑥ 거절 뒤 재요청 간격 | §14-5(거절한 사람이 해제 전 재요청 불가)로 대체·적용 완료 | **변경 안 함** |

**변경안 (마이그레이션 1개 · DB 만 · 앱 코드·네이티브·통화 무변경)**

1. 권한: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_social_relations FROM anon, authenticated;` — SELECT 는 유지(방·홈 Realtime 구독이 RLS 로 본인 행만 받음).
2. `cm_accept_friend_request`: 요청 행 잠금 뒤, 두 사람 사이 활성 차단(어느 쪽이든)이 있으면 친구 행을 만들지 않고 `{ok:false, error:'blocked_target'}`. 나머지 본문 동일.
3. `cm_send_friend_request`: 시작 시 두 사람 쌍 잠금 `pg_advisory_xact_lock(hashtextextended(least(a,b)||':'||greatest(a,b), 0))` — 같은 쌍의 동시 요청을 줄 세워 연타는 「이미 요청함」, 양방향 동시는 뒤 요청이 「받은 요청 있음」으로 처리. 나머지 본문 동일.
- 서버 오류 문구: `blocked_target` 은 기존 코드(보내기와 같은 값)라 수락 실패 안내도 기존 문구로 나옴 — 앱 변경 불필요(적용 후 실기기로 확인).

**영향 · 호환**
- 앱의 친구·차단 쓰기는 모두 서버 API(service role) → 권한 회수로 바뀌는 앱 동작 없음. 설치된 구 바이너리도 웹 API 를 쓰므로 영향 없음.
- 정상 흐름(보내기·수락·거절·취소·친구 삭제·차단·해제) 결과 동일. 달라지는 것: 차단 사이 수락 거부, 연타 시 실패 대신 「이미 요청함」.
- 롤백: 같은 마이그레이션에 이전 정의 원문 보관 → `GRANT INSERT, UPDATE, DELETE, TRUNCATE ... TO anon, authenticated;` + 두 함수 이전 정의 재적용.

**적용 후 검증 (운영 DB + 실기기, Samsung q ↔ iPhone w)**
- DB: 두 함수 정의·권한 조회로 반영 확인.
- 정상: 요청 → 수락 → 친구 삭제 / 요청 → 거절 → 해제 / 요청 → 취소 / 차단 → 해제.
- 결함 재현: q→w 요청 → q 가 w 차단 → w 수락 → `blocked_target`, q 차단 유지(DB).
- 연타: 같은 요청 동시 2회 → 둘 다 성공 응답(1건은 이미 요청함), 대기 1건.
- 시험 데이터 원복.

**범위 밖 (보고만, 이번 변경에 넣지 않음)**
- 차단 시 차단당한 쪽의 친구 행은 남음(차단한 쪽 행만 삭제) — 운영 3건. 차단당한 사람 친구 목록에 차단한 사람이 계속 보임. 정책 판단(차단 사실 비노출 vs 목록 정리) 필요.
- 차단해도 대기 중 친구 요청이 남고, 받은 요청 목록이 차단을 거르지 않음(앱 코드). 위 2번으로 수락은 막히지만 목록·팝업 표시는 남음.
- 수락 요청 없이 생긴 옛 친구 행 75건(2026-10-23 이전, 요청 방식 도입 전 연락처 모델) — 정상 이력으로 보이며 정리하지 않음.
- `community_friend_requests` 의 쓰이지 않는 INSERT/UPDATE 정책(권한이 없어 무효) — 그대로 둠.

**§17-6 적용·검증 결과 (Owner 승인 · `3f1cf3e92` · 운영 DB 적용 2026-10-26 00:57:31 PHT)**

- 적용: `execute_sql` 단일 트랜잭션 + `schema_migrations` 20270627120000 기록. 반영 확인: `user_social_relations` anon·authenticated = SELECT·REFERENCES·TRIGGER 만, send 정의에 `pg_advisory_xact_lock`, accept 정의에 차단 확인, 두 함수 실행 권한 service_role 만.
- 실기기(Samsung q · iPhone w, 00:57~01:00 PHT):

| # | 시험 | 결과 |
|---|---|---|
| 1 | Samsung 방 [친구 추가](화면) → iPhone 방 바 [수락](화면) | 요청 보냄 · 「친구가 되었습니다」 PASS |
| 2 | 친구 삭제 / 요청 → 거절 → 재요청(`request_rejected`) → 해제 / 요청 → 취소 / 차단 → 해제(방 복원) | 모두 200·기존과 같은 결과 PASS |
| 3 | 결함 재현 ②: 대기 요청 + 요청자 차단 상태에서 수락 (운영 DB 트랜잭션 안에서 실행 후 ROLLBACK — 데이터 무변경 확인) | `blocked_target` · 차단 행 유지 · 친구 행 0 PASS |
| 4 | 같은 요청 동시 3회(Samsung) | 1건 생성 + 2건 「이미 요청함」, 대기 1건 PASS |
| 5 | 양방향 동시(Samsung q→w · iPhone w→q) | **FAIL — 대기 2건** (아래) |

- **#5 원인(기존 함수 순서 결함, 이번 잠금과 무관)**: 잠금으로 두 요청은 줄 섰다(w→q 00:00.93 → q→w 01.00). 그러나 q→w 는 예전 요청 행(취소됨)이 있어 「되살리기」 분기로 바로 pending 이 되고, 「받은 요청 있음」 확인은 행이 **없을 때만** 한다 → 이전에 요청한 적 있는 두 사람은 동시가 아니어도 서로 대기 요청 2건이 생길 수 있음. 설계에 적은 「양방향은 받은 요청 있음」을 이번 적용으로 달성하지 못함.
- 수정안(승인 필요 · 운영 DB): `cm_send_friend_request` 에서 「받은 요청 있음」 확인을 기존 행 되살리기보다 **먼저** 하도록 순서만 이동(다른 본문 동일).
- **설계 기술 정정**: §17-6 「범위 밖」의 ①「차단해도 대기 요청이 남음」 ②「차단당한 쪽 친구 행이 남음」은 메신저 차단(`relations/block`)·커뮤니티 차단에는 해당 없음 — §14-5 로 양쪽 친구 행 삭제·대기 요청 취소를 이미 함(시험 #3 준비 중 확인). 운영 3건은 §14-5 이전 차단(2026-06-18, 10-13)의 잔여. 거래 채팅 차단 `app/api/chat/rooms/[roomId]/block` 만 이 정리를 하지 않음(범위 밖, 보고) — 그래서 ② 수락 차단 확인은 계속 필요.
- 시험 데이터 원복: 요청 9e658188·dda576aa `cancelled` · q↔w 친구 0 · 활성 차단 0 · q 방 숨김 없음 · 전체 이중 대기 0.

**§17-6 양방향 수정 (Owner 승인 · `00c086bae` · 운영 DB 적용 2026-10-26 01:02:36 PHT)**

- 변경: `cm_send_friend_request` 의 「받은 대기 요청 있음」 확인을 내 기존 행 조회·되살리기보다 먼저(순서만 이동, 잠금·그 밖 본문 동일). `schema_migrations` 20270628120000 기록. 반영 확인: 정의 순서·잠금 유지·실행 권한 service_role 만.
- 실기기(Samsung q · iPhone w, 01:02~01:03 PHT):
  - 양방향 동시 2회: 매번 한쪽만 생성, 다른 쪽 `incoming_request_exists` — 대기 2건 0 PASS.
  - 순서 반대(q 먼저 → w): w `incoming_request_exists` PASS.
  - 정상: 요청 → 수락 → 친구 삭제 PASS · 예전 행 없는 새 쌍(w→zxzx11) 요청 → 취소 PASS.
  - 화면: Samsung·iPhone 방 바 「친구 아님」 정상.
- 원복: 요청 3건 `cancelled` · q↔w 친구 0 · 시험 계정 사이 활성 차단 0 · 전체 이중 대기 0.
