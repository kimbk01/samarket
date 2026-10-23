# E-C3 상세 설계 — 통화 중앙 공통 안내 팝업

- 작성: 2026-10-23 ~23:00 PHT · **구현(웹 A)**: ~23:00 PHT · main/Prod **별도 승인**
- 계획: `messenger-2026-10-22-reaudit-plan.md` §P2 U · SCOPE · SIDE-08 **웹 CLOSED(E-C3 통합)**
- Owner 승인: 웹만 · 5이벤트 · 버튼「확인」 · 네이티브 overlay 미승인
- **제외:** C2-C/D · 네이티브 · CallKit/VoIP/FCM · DB · 신규 팝업 프레임워크

## 구현 상태 (웹 A)

| 항목 | 결과 |
|---|---|
| contract `CENTER` | 5이벤트 · durationMs null |
| Host | CENTER→`CallInAppNoticeCenterDialog` · 그 외 배너 |
| UI·UX·CTA 보완 | DibayDialog+Overlay SSOT · DIBAY logo mark · title/body 분리 · light lock ·「확인」primary(active scale) · 공통 InfoDialog 시각 **비변경** |
| nativeOwned skip | 기존 finalize 유지 |
| 단위 테스트 | contract + center-copy PASS |
| 실기기 UI 동일성 | **NOT_PROVEN** |
| main / Production | **보류** (UI 실기기 검증 전) |

---

## 0. 선행 상태 (잠금)

| 항목 | 상태 |
|---|---|
| E-C2-C | BLOCKED — 연결 불가 증거 없음 · 재조사 금지 |
| E-C2-D | **구현 보류** — 웹 재연결 시도·fail timer 존재 · `reconnect_failed` writer 없음 · 네이티브 재연결 NOT_PROVEN · 기존 재연결/정상종료 **변경 금지** |
| C2-B Phase A | 코드만 · 실기기 본경로 NOT_PROVEN · Native release NOT APPROVED |

---

## 1. 기존 동작 (확인)

### 1.1 표시 채널

| 표면 | 형태 | 위치 | 근거 |
|---|---|---|---|
| **웹** (메신저 layout) | `CallInAppNoticeBanner` | 상단 fixed · `z-[1285]` | `CallInAppNoticeHost` ← `community-messenger/layout.tsx` |
| **계약** | event → BANNER / PERSISTENT_BANNER | SSOT `call-in-app-notice-contract.ts` | presentation에 **CENTER 없음** |
| **스토어** | MAX=1 · priority replace · duration 자동 dismiss · show 시 snackbar dismiss | `call-in-app-notice-store.ts` | |
| **Android Native Activity** | `NativeCallInAppNoticeOverlay` | **TOP** + safe inset · 후 `Activity.finish` | `finishWithNotice` |
| **iOS Native VC** | `NativeCallInAppNoticeOverlayView` | **TOP** safeArea · 후 dismiss | `presentCallInAppNoticeThenDismiss` |
| **Cap `no_answer`** | 네이티브 miss notice 미배선 → 셸 해제 대기 후 **웹 배너** | `call-v4-actions` finalize | |
| **CallKit / FSI / FGS** | 인앱 notice 범위 **밖** (계약 명시) | — | 유지 |

### 1.2 역할 구분 (현행)

| 채널 | 역할 |
|---|---|
| 상단 배너 / 네이티브 상단 오버레이 | 단말 안내 (busy·거절·실패·무응답·부재 등) |
| 메신저 snackbar | 일반 토스트 · notice show 시 밀어냄 |
| 전체화면 수신·통화 셸 | 조작 UI (수락/거절/스피커 등) |
| **중앙 공통 팝업** | **없음** (계획 U · SIDE-08 Owner 요청) |

### 1.3 가림·충돌 (확인)

| 상황 | 위험 |
|---|---|
| 통화 **종료 후** 메신저/채팅 복귀 | 상단 배너가 헤더「채팅」과 Y겹침 — **SIDE-08 증거** (`caller-notice-*.xml`) |
| 네이티브 통화 **중** 상단 notice | 조작 버튼보다 위 · 중앙 풀스크린 아님 · CallKit과 별개 |
| CallKit / 시스템 수신 UI 위 인앱 중앙 모달 | **금지** (이중 UI · OS 소유) |
| 연결 중 `reconnecting` PERSISTENT_BANNER | 진행 표시 · **중앙 팝업 대상 아님** (C2-D 보류와도 분리) |

---

## 2. 실제 결함

1. **제품 기대(중앙) ≠ 구현(상단 배너)** — 계획 U · SIDE-08 · Owner.
2. 상단 배너가 **헤더/네비와 겹침** (실기기 XML).
3. 웹·Android·iOS가 **같은 이벤트·다른 셸**(웹 배너 vs 네이티브 TOP overlay) — 기기 통일 미완.
4. 네이티브 `finishWithNotice`와 웹 `showCallInAppNotice*` **이중 채널** 가능 (일부 reason은 nativeOwned skip · `no_answer`는 웹 전용 대기).

C2-C/D 미확정 상태는 본 결함과 **무관 · 포함 금지**.

---

## 3. 최소 수정안 (승인 후 · 신규 시스템 금지)

### 3.1 재사용 SSOT

| 재사용 | 용도 |
|---|---|
| `call-in-app-notice-contract` + store | event·priority·MAX=1·문구 키 **유지** |
| **`DibayInfoDialog`** (`dibay-overlay`) | 중앙 1버튼(확인/닫기) — **기존 앱 공통 다이얼로그** |
| 기존 i18n messageKey / FALLBACKS | 카피 재작성 최소화 |

새 Alert/모달 라이브러리·친구 요청 시트 복제 **금지**.

### 3.2 대상 이벤트 (확정분만)

| 포함 (E-C3 중앙) | 이유 |
|---|---|
| `no_answer` | 발신자 안내 CLOSED |
| `peer_busy` / `caller_busy` | E-C1 CLOSED |
| `call_failed` | 확정 실패 안내 |
| `peer_declined` | 기존 거절 안내 (확정) |

| 제외 | 이유 |
|---|---|
| unreachable / reconnect_failed | C2-C/D 미확정 |
| `reconnecting` / `network_warning` | 진행·경고 → **배너 유지** |
| `missed` (수신 부재) | 배너 유지 권장(정보성) · Owner가 중앙 원하면 별도 승인 |
| `permission_required` | PERSISTENT · 설정 유도 → **1차 배너 유지** (중앙 시 네이티브 권한 시트와 경합) |
| `remote_ended` | 정상 종료는 종종 침묵 · 중앙 남발 금지 |

### 3.3 presentation 규칙

1. 계약에 `presentation: "CENTER"` 추가(또는 TERMINAL 중 위 표만 CENTER).
2. `CallInAppNoticeHost`: CENTER → `DibayInfoDialog` · BANNER는 기존 배너.
3. **동일 event: 배너와 중앙 동시 표시 금지** (한 renderer만).
4. 타이밍: **통화 셸/네이티브 establishment 소유 중에는 웹 중앙 표시 금지** (현 `nativeOwned` skip 유지 · `no_answer`는 셸 해제 후 웹 중앙).
5. CallKit/VoIP/FCM 수신·종료 시스템 UI **비변경**.
6. dismiss / 확인 / 자동 duration: store clear · **라우트 복귀·앱 resume만으로 재show 금지** (새 `show()` 없으면 재표시 없음).
7. 뒤로가기: `DibayDialog` dismissible → store dismiss (확인과 동일 결과).

### 3.4 웹만 vs 네이티브

| 범위 | 내용 | 빌드 |
|---|---|---|
| **A. 웹만 (1차 권장)** | Cap WebView + 순수 웹 경로의 확정 이벤트 → `DibayInfoDialog`. Android/iOS **Activity/VC overlay 코드 변경 없음** | 웹만 · 재빌드 불필요 |
| **B. 네이티브 패리티 (별도 승인)** | Native TOP overlay → 중앙 카드(동일 문구·1버튼) · CallKit 위 표시 금지 | Android+iOS 빌드·버전 |

1차는 **A만**. B는 Owner가 기기 통일을 네이티브 셸까지 요구할 때만.

---

## 4. 기기별 영향

| 기기 | A(웹만) 효과 | 잔여 |
|---|---|---|
| **웹 / Cap 복귀 후** | busy·no_answer·failed·declined → 중앙 · 헤더 겹침 완화 | |
| **Android Native 종료 직전** | 기존 TOP overlay 유지 (미변경) | 셸 안 안내는 상단 잔존 → B 필요 시 |
| **iOS Native** | 동일 | CallKit 무변경 |
| **Samsung 디버그 / Xiaomi 정상본** | 웹만이면 **설치 불변** | 네이티브 릴리스 금지 유지 |

---

## 5. 검증 방법 (구현 승인 후)

| # | 시나리오 | PASS |
|---|---|---|
| 1 | peer_busy / caller_busy | 중앙 1회 · 배너 없음 · 기록 E-C1 불변 |
| 2 | no_answer (발신) | 중앙 「응답하지 않음」 · callee missed 문구 아님 · Cap은 셸 해제 후 1회 |
| 3 | call_failed / peer_declined | 중앙 1회 |
| 4 | 정상 종료 | 중앙 없음(침묵) |
| 5 | 수신 중 CallKit | 인앱 중앙 **없음** |
| 6 | 닫기·백·duration | store clear · 앱 복귀만으로 재표시 없음 |
| 7 | A행렬 회귀 | VoIP/FCM/수락·거절·재발신 무회귀 |

---

## 6. Owner 승인 게이트 (구현 전)

1. 1차 범위 = **웹만(A)** · 네이티브 오버레이(B)는 보류?  
2. 중앙 대상 = `no_answer` · `peer_busy` · `caller_busy` · `call_failed` · `peer_declined` 수용? (`missed`/`permission` 제외)  
3. SIDE-08을 E-C3에 **흡수**(표시 형태)해도 되는가?  
4. 확인 버튼 라벨 (`확인` / `닫기`)?  

**이번 지시 = 설계만.** 구현·main·Prod·네이티브 = 별도 승인.
