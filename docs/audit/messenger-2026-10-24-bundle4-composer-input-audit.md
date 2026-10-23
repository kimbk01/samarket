# §2 묶음 4 입력창 — 감사·원인·최소 수정 설계 (구현 전)

- 작성: 2026-10-24 ~01:20 PHT
- Owner 지시: 묶음 3 CLOSED 후 순서대로 · **감사 · 원인 · 최소 설계까지** (코드·DB·main·Prod·네이티브 **금지**)
- SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §2 우선4 · §5-4
- **제외:** 묶음 1·2·3·5 · 통화/네이티브 · SIDE · CLOSED 재조사 · 목록 스와이프·친구 요청

참고: 묶음 3은 CLOSED 유지 · 재개봉 없음. 본 문서는 구현 없음.

---

## 1. §2 묶음 4 원래 요구사항

| ID | 결함(계획 원문) | 설계 방향(§5-4) | 당시 근거 경로 |
|---|---|---|---|
| **K-1** | 모바일 Enter 가 전송 | 모바일 Enter = 줄바꿈 · 전송은 버튼만 (D3) | `CommunityMessengerRoomPhase2Composer.tsx` |
| **K-3** | 수정 실패 시 글 사라짐 | 수정 실패 시 입력 내용 복원 | `use-messenger-room-phase2-controller.ts` |
| **K-4** | 수정 중 이모지가 원문 대체 | 이모지 시트를 수정 모드와 분리(또는 드래프트 삽입) | `CommunityMessengerRoomPhase2RoomSheets.tsx` |
| **K-2** | 높이 고정 | (표기 · 입력창이 줄수에 맞게 늘어나야 함) | `messenger-composer-sector.tsx` |

실기기 표기(계획): K-1·2 Y. **이번 세션 실기기 재측정 없음 → DEVICE NOT_PROVEN.**

---

## 2. 항목별 현재 상태 (코드 대조 · HEAD `9c5d7df83` / 코드 `27528ec3d` 계열)

| ID | CODE | DEVICE | 요약 |
|---|---|---|---|
| **K-1** | **FAIL** | **NOT_PROVEN** | `onTextareaKeyDown`: Enter(·NumpadEnter) + !shift + !composing → `preventDefault` + `commitTextSend()`. 모바일·데스크톱 동일. Shift+Enter만 줄바꿈. D3(모바일 Enter=줄바꿈·버튼 전송) 위반. |
| **K-3** | **FAIL** | **NOT_PROVEN** | `sendMessage` 편집 분기: `setMessage("")` **후** `await editRoomMessageText`. 실패 시 스낵바만 · **draft 복원 없음**. `editingMessage`는 유지되나 textarea는 빈 문자열. (신규 전송 M-8 fail-restore와 비대칭) |
| **K-4** | **FAIL** | **NOT_PROVEN** | 이모지 `onPick` → `void vm.sendMessage(emoji)`. 편집 중이면 `editRoomMessageText(id, emoji)` 경로로 **본문이 이모지 한 글자로 교체**. |
| **K-2** | **FAIL** | **NOT_PROVEN** | `MessengerComposerSector`: `rows={1}` · `max-h-[36px]` · pill `h-9 max-h-9` · sector `MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS` 고정. 다줄 입력 시 높이 성장 없음(내부 스크롤만). |

---

## 3. 확인된 결함 원인

### K-1
- Enter 핸들러가 플랫폼 구분 없이 전송. soft keyboard Enter도 전송으로 가로챔.

### K-3
- 편집 성공 전에 composer를 비움. 실패 분기(`!res.ok`)에서 `setMessage(trimmed)` 복원 없음.

### K-4
- 이모지 픽커가 「즉시 전송」 API(`sendMessage`)만 호출. 편집 모드·드래프트 삽입 분기 없음.

### K-2
- 컴팩트 LINE형 레이아웃이 1행 고정으로 구현됨. 다줄·줄바꿈(K-1)과 충돌.

---

## 4. 최소 수정 설계 (승인 후 구현)

| ID | 파일(예상) | 변경 요지 | 웹/DB/네이티브 |
|---|---|---|---|
| **K-1** | `CommunityMessengerRoomPhase2Composer.tsx` (± 작은 helper) | **터치/네이티브(coarse 또는 Capacitor native)**: Enter에서 `preventDefault`·전송 **하지 않음**(줄바꿈). **데스크톱(fine pointer·비네이티브)**: 현행 유지(Enter=전송 · Shift+Enter=줄바꿈). 전송 CTA는 기존 버튼. | **웹만** |
| **K-3** | `use-messenger-room-phase2-controller.ts` `sendMessage` / `editRoomMessageText` | 편집 시 **성공 전 `setMessage("")` 금지**. 실패 시 draft=`raw` 유지(또는 명시 복원) · `editingMessage` 유지. 성공 시에만 clear + `setEditingMessage(null)`(현 `editRoomMessageText` 성공 경로와 정합). | **웹만** |
| **K-4** | `CommunityMessengerRoomPhase2RoomSheets.tsx` (± composer draft setter) | `editingMessage` 있으면 `sendMessage(emoji)` **금지**. 커서/끝에 이모지를 **draft에 삽입** 후 시트 닫기(또는 수정 중 이모지 시트 비활성 — 삽입이 UX상 최소). 비편집은 현행 즉시 전송 유지. | **웹만** |
| **K-2** | `messenger-composer-sector.tsx` (± viewport tuning 상수) | textarea·pill이 **내용 줄수에 따라 성장**(상한 예: ~4~5줄 / ~80–100px). sector 고정 `h-9` 완화. **키보드·뷰포트 계약**(`docs/community-messenger-mobile-room-viewport.md` · `verify:cm-room-keyboard-layout-contract`) 회귀 금지 — 구현 시 관련 verify 1회. | **웹만** |

**잠금 테스트(구현 시)**
- K-1: coarse/native 경로에서 Enter keydown이 send를 호출하지 않음 · desktop Enter는 send 호출(소스/단위).
- K-3: edit PATCH 실패 mock → `message` draft가 raw로 복원·유지.
- K-4: editing 중 emoji pick → draft에 emoji 포함 · `sendMessage`/`edit` API 미호출.
- K-2: sector/textarea max-height > 1행 · rows/auto-grow 계약 소스 또는 동작 테스트.

**영향:** 방 composer·이모지 시트·편집 PATCH UX. bump·차단·삭제 트리거·통화 **비변경**.

**미변경:** CallKit/VoIP · 네이티브 · DB · 묶음 5 · 홈 목록 · 스티커 즉시전송(비편집) 정책.

---

## 5. Owner 추가 승인 필요 여부

| 항목 | 필요 |
|---|---|
| K-1·2·3·4 **웹 최소 수정 구현** | **예** |
| main · Production | **별도** |
| DB 마이그레이션 | **불필요** |
| 실기기 | 구현 후 · 미실시면 **NOT_PROVEN** |
| 키보드 layout verify | 구현 시 K-2 관련 1회 |

---

## 6. 결론 (감사 시점)

- 묶음 4 **수정 대상: K-1 · K-2 · K-3 · K-4** (웹 최소).
- 구현·배포·실기기 **미실시** · 본 문서로 **STOP** (Owner 구현 승인 대기).
- 묶음 3 **CLOSED 유지**.

---

## 7. 구현 보고 (Owner 웹 승인 후 · 로컬만 · ~01:25 PHT)

| ID | 원인 | 수정 파일 | 로컬 테스트 | 미검증 |
|---|---|---|---|---|
| **K-1** | Enter 무조건 전송 | `messenger-composer-enter-policy.ts` · `CommunityMessengerRoomPhase2Composer.tsx` — native/coarse → newline · desktop Enter send · IME skip | vitest PASS | DEVICE |
| **K-2** | sector/textarea 1행 고정 | `messenger-chat-viewport-tuning.ts` · `messenger-composer-sector.tsx` — min 44 · textarea max 100 · sector max 120 · auto-grow | vitest + `verify:cm-room-keyboard-layout-contract` PASS | DEVICE |
| **K-3** | 편집 전 clear · 실패 무시 | `use-messenger-room-phase2-controller.ts` · composer `commitTextSend` — 성공 전 clear 금지 · `editRoomMessageText`→boolean · 실패 유지 · 대기 중 신규 입력 보존 · **M-8 신규 전송 경로 미변경** | vitest PASS | DEVICE |
| **K-4** | emoji→`sendMessage` | `messenger-composer-emoji-insert.ts` · controller `insertOrSendComposerEmoji` · RoomSheets — 편집 중 draft 삽입 · API 미호출 | vitest PASS | DEVICE |

**검증:** vitest 10 PASS · eslint error 0 · `typecheck:build` PASS · `verify:cm-room-keyboard-layout-contract` PASS · `npm run build` PASS.  

---

## 8. main · Production · DEVICE (Owner 승인 후)

| 항목 | 결과 |
|---|---|
| main SHA (코드) | (배포 직후 기입) |
| Production | (Ready / dpl) |
| K-1·K-2·K-3·K-4 CODE | PASS |
| DEVICE | (기입) |
| 판정 | (CLOSED / 보류) |

