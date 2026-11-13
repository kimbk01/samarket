# 연락처 친구 찾기 — 재접속마다 다시 뜨는 안내 재감사·설계안 (2026-11-14)

- 기준 코드: `origin/main` `0237ba5e2` · 운영 DB 읽기 전용 조회 03:13 PHT
- 계약 2개: 연락처 `docs/design/messenger-contacts-sync-plan.md` v5 (#11 · §2-1 · §7 · §8 · §10) / 인증 `docs/dibay-auth-full-audit-ssot-design-2026-10-21.md` §1.4 + 검사 `scripts/verify-auth-session-contract.mjs`
- 범위: 감사·설계안. 코드·DB 변경 없음.

## 0. 1차 보고 정정 (작업자 오류)
| # | 1차 보고 | 정정 |
|---|---|---|
| 1 | 수정안 「보존 목록에 연락처 키 1줄 추가」 | 인증 계약 §1.4 「로그아웃 = localStorage 전체 sweep(4키 제외)」 과 검사 스크립트(「clearEphemeralLocalStorage 무조건 호출」)를 확인하지 않고 낸 안. 인증 계약 위반이라 철회 |
| 2 | 문구 결함 수정에 「`GET /sources` 응답에 개수 추가」 필요 | 응답에 이미 `entryCount` 가 있음. 앱이 안 쓰는 것이 원인 |
| 3 | 원인 = 「로그아웃 코드」 | 근본 원인은 계약끼리 충돌 (아래 §2). 로그아웃 코드는 인증 계약대로 동작 중 |

## 1. 재현 (실제 코드 실행)
시험 파일: 실제 `contacts-sync-engine` · `contacts-local-store` · 로그아웃 정리 함수(`wipeAllExceptDevicePrefs` = 로그아웃 정리의 `clearEphemeralLocalStorage()` 와 같은 함수). 네이티브·API 만 모의.

| 단계 | 결과 (출력값 그대로) |
|---|---|
| 동기화 후 | 키 3개 `dibay:cm-contacts:v1:<회원>` · `#m` · `#n` / consented=true · deviceApproved=true · newDeviceAsked=true · sourceId=src-1 · 번호 5 |
| 로그아웃 정리 후 | 남은 키 = `dibay:client_instance_id` 1개 / consented=false · deviceApproved=false · newDeviceAsked=false · sourceId=null · 번호 null |
| 앱 시작 처리 조건 | `readContactsConsentedFlag` = false → 앱 시작 동기화 안 돎 |
| 재로그인 후 친구 탭 (서버 동의=true 다시 기록) | 엔진 결과 `device_not_approved` → 안내 표시 조건 |
| 「추가」·「시작하기」 다시 누름 | `uploaded`, 요청 종류 `snapshot_chunk` = 주소록 **전체** 다시 올림 |

→ 같은 회원·같은 폰이어도 로그아웃 정리 1번이면 안내가 처음부터 다시 나오고 전체를 다시 올린다. (코드 PASS 수준 증거 · 기기 화면은 §4)

## 2. 근본 원인 — 계약 충돌
| 계약 | 정한 내용 |
|---|---|
| 인증 §1.4 (2026-10-21) | 로그아웃 = localStorage **전체 삭제** (언어·설치 ID 등 4키만 남김). 검사 스크립트가 강제 |
| 연락처 §8 (2026-11-10) | 로그아웃 = 「처리 없음」, 기기 안 연락처는 **다른 회원 로그인 시에만** 삭제 · §10 #7 「로그아웃 → 변화 없음」 |
| 연락처 §2-1 | 로그아웃·세션 코드는 **바꾸지 않음** |

- 연락처 설계는 인증 계약과 함께 지킬 수 없는 동작(로그아웃 후 유지)을 전제로 만들어졌다. 그 상태 값(이 기기 허락·「1번 물음」·출처 ID·번호표)을 **기기에만** 두고 서버에서 되찾는 경로가 없다.
- 그래서 로그아웃 정리가 돌 때마다 이 폰은 「처음 보는 기기」가 된다. 단, 서버에는 같은 설치 ID 로 이 폰의 출처가 그대로 남아 있다(운영 확인 §3).
- 로그아웃 정리가 도는 경로 (코드 전수): 로그아웃 버튼(이 기기·모든 기기) · 다른 탭 로그아웃 알림 · 세션 확정 종료(토큰 무효, 회원 조작 없이) · 손상 세션 강제 정리 · 계정 전환.

### 원인 2 — 「다른 기기에서 동기화한 연락처가 있어요」 문구가 실제와 다름
- `use-messenger-contacts.ts` 는 「이 기기가 아닌 active 출처가 1개 이상」만 본다. 서버는 출처별 `entryCount` 를 이미 주지만 앱이 쓰지 않는다.
- 운영: BK 계정의 다른 iOS 출처 `0bb02cb7…` 은 번호 **0개**인데도 안내 대상이 된다.

## 3. 운영 DB 근거 (읽기 전용)
- `install_ref = sha256(user_id:device_id)` 대조로 출처 4개 모두 실제 설치와 1:1 확인.
- BK: 현재 로그인 세션은 11-13 21:20:56 에 시작(`auth.sessions` 1개, `last_sign_in_at` 같은 시각). 이전 세션은 남아 있지 않다. 이 아이폰 설치 `7ce3219f…` 의 출처는 그 뒤 11-13 23:08 에 생성됐고 번호는 0개.
- q테스트1: 11-13 13:29 재설치(`4b044784…`)는 출처가 없고, 옛 설치 `aa287a02…` 가 「다른 기기」로 남아 있다. 재설치 후 1번 묻는 것은 계약(§10 #9)대로다.
- 인증 감사 로그(`auth.audit_log_entries`)는 운영에서 0건이라 로그아웃 시각은 확인 못 함.

## 4. NOT_PROVEN
| 항목 | 이유 |
|---|---|
| Owner 휴대폰 화면에서 반복 표시 | 기기에서 로그아웃 → 재로그인을 하려면 운영 앱에 계정 로그인을 입력해야 함(작업자 입력 금지). Samsung 은 다른 세션이 사용 중 |
| Owner 의 「재접속」이 로그아웃·세션 종료인지 | 감사 로그 없음. 로그아웃 정리 없이 앱만 다시 열면 상태가 유지됨(기존 시험 `contacts-sync-engine-split`) |
| BK 아이폰 출처 번호 0개 | 원인 확인 못 함 (권한 「일부 허용」 0명·빈 주소록·번호 형식 중 무엇인지 모름) |

## 5. 설계안 (권장 1안 · Owner 승인 후 구현)
원칙: 인증 계약(로그아웃 = 기기 저장값 삭제, 계정 분리)은 그대로 둔다. 연락처는 **서버에 이미 있는 이 기기 출처(설치 ID)** 로 상태를 되찾는다. 인증 코드·DB 변경 없음.

| # | 원인 | 수정 | 파일 | 영향·같은 단계 처리 |
|---|---|---|---|---|
| R1 | 로그아웃 후 이 기기 상태 없음 | 서버 동의=true 인데 기기에 출처 ID 가 없으면 `GET /sources` 1회(이미 있는 API) → 이 기기(`isThisDevice`) active 출처가 있으면 출처 ID·「이 기기 허락」을 기기에 다시 기록하고 묻지 않음 → 번호표가 없으므로 전체 스냅숏 **1회** (서버가 세대 교체) | `lib/community-messenger/contacts/use-messenger-contacts.ts` (start) | 로그인 1회당 요청 1개 추가 · bootstrap·Realtime 무관 · 지운 출처(removed)는 목록에 없으므로 기존 A9 대로 멈춤 유지 |
| R2 | 앱 시작 처리 조건(기기 동의 표시)도 지워짐 | R1 로 기록된 뒤부터 다음 실행은 그대로 동작. 재로그인 직후 첫 실행은 친구 탭을 열 때 시작 | 변경 없음 | 앱 시작에 설정 조회를 추가하지 않음(전 회원 호출 증가 방지) |
| R3 | 문구가 실제와 다름 | 「다른 기기」 판정을 `!isThisDevice && entryCount > 0` 으로 | `use-messenger-contacts.ts` afterSync | API 변경 없음 |
| R4 | 계약 문서 불일치 | 연락처 §8 로그아웃 행을 인증 계약에 맞게 정정: 「기기 안 삭제(인증 §1.4) → 같은 회원 재로그인 시 서버 출처로 복구, 전체 스냅숏 1회」 · §10 #7 동일 | `docs/design/messenger-contacts-sync-plan.md` | 같은 PR |
| 시험 | — | 위 재현 시험을 vitest 로 추가: 정리 후 재로그인 → 묻지 않음·출처 복구·스냅숏 1회 / 다른 기기 0개면 묻지 않음 / 다른 회원 로그인은 기존대로 삭제 | `lib/community-messenger/contacts/__tests__/` | — |

남는 한계 (Owner 결정 필요): 이 폰에서 「나중에」만 누르고 올린 적이 없으면 서버에 기록이 없어, 로그아웃 정리 뒤 다시 1번 묻는다. 로그인마다 1번까지 줄일 수는 있지만 「계정당 1번」으로 하려면 서버 기록(운영 DB 변경)이 필요하다.

배포 구분: 웹 (main 반영 후 앱 재시작). 네이티브·DB 변경 없음.

## 6. 구현 기록 (Owner 「R1~R4 구현」 2026-11-14)
- R1·R3: `lib/community-messenger/contacts/contacts-device-restore.ts` (신규) · `use-messenger-contacts.ts` (start 에서 기기에 출처·허락이 없을 때만 1회 복구, 「다른 기기」 판정 = 번호 1개 이상).
- R2: 코드 변경 없음 (복구 뒤 다음 실행부터 앱 시작 처리 동작).
- R4: `docs/design/messenger-contacts-sync-plan.md` §0-1 #12 · §8 로그아웃 행 · §10 #7.
- 시험: `lib/community-messenger/contacts/__tests__/contacts-relogin-restore.test.ts` 5개 — 실제 로그아웃 정리 함수 실행 후 복구·스냅숏 1회·이후 변경분·서버 조회 1회·출처 없음은 기존대로 묻기·0개 출처 제외.
- 인증 코드·DB·네이티브 변경 없음.

## 7. 최종 점검 후속 (Owner 「남은 누락 ②와 중복도 수정」 2026-11-14)
- **작업자 결함 (#289)**: 복구 조회가 「기기에 출처·허락이 없으면」 화면이 열릴 때마다 돌았다 — 이 기기 출처가 없는 회원(「나중에」·처음)은 친구 탭을 열 때마다 `GET /sources` 1회씩 반복. 분할 화면에서는 훅 2개가 동시에 조회. 예전 코드로 새 시험을 돌려 2건 실패로 확인.
- 수정: `loadContactsDeviceSourcesOnce` — 기기 출처 조회(+복구)를 앱 실행 중 회원별 1번·동시 1개로 묶고, 시작 단계와 「다른 기기」 판정(afterSync)이 같은 결과를 함께 쓴다. 실패는 기억하지 않아 다음 진입에서 다시 시도. 동의·삭제 등(`invalidateMessengerContactsCache`) 때 초기화.
- 누락 ② 수정: 실제 훅 `useMessengerContacts` 를 그리는 시험 `use-messenger-contacts-relogin.test.tsx` 3개 — 로그아웃 정리 뒤 훅 2개 동시 시작(조회 1번·복구·안내 없음·전체 업로드 1회) / 출처 없는 기기 재진입(조회 1번) / 다른 기기 0개(안내 없음).
