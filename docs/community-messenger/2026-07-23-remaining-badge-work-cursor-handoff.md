# Cursor 작업 프롬프트 — 채팅 뱃지/알림 잔여 이슈 인계 (2026-07-23)

> 이 문서를 그대로 Cursor에 붙여넣어 작업 지시로 사용할 것. "완료" 항목은 커밋 해시로 검증됨. "미완료" 항목은 절대 완료로 표시하지 말 것. 이 세션에서 Claude가 직접 구현을 시도하지 않고 여기로 넘기는 이유는 문서 맨 아래 명시.

## 0. 왜 이 문서가 필요한가

사용자 실기기 재현 기준으로 다음이 아직 안 됨:
1. 채팅방 읽음 처리 후 뱃지가 사라졌다가 다시 나타남.
2. 메시지를 보내도 실시간으로 뱃지가 갱신 안 됨 — 새로고침하거나 다른 도메인 갔다가 재진입해야 반영됨.
3. 채팅방 진입이 한 번에 안 되고 여러 단계를 거쳐 들어가는 것처럼 보임.

아래에서 "확정 완료(커밋됨)"와 "미완료(코드는 있으나 검증/커밋 안 됨, 또는 아예 미착수)"를 구분한다.

---

## 1. 확정 완료 — 커밋됨 (git log 기준 실제 확인)

`git log --oneline -6` 결과:

```
c946e6cfe fix(messenger): reject out-of-order domain_authority hub badge applies
e78906900 fix(messenger): live-patch trade/order domain lists from room bus
59add9281 fix(messenger): play cross-room sound while viewing another room
c4c9c4104 docs(messenger): Phase 0-1 quarantine markers and architecture audit
```

- **`59add9281`** — 방에 들어가 있을 때 다른 방 알림 소리가 전부 죽는 버그. `lib/community-messenger/notifications/use-cm-participants-hub-sync.ts`에서 현재 열린 방과 이벤트 발생 방을 `getMessengerRealtimeFocusedRoomIdNorm()`으로 비교하도록 수정. 테스트 통과, 사용자 확인상 배포됨.
- **`e78906900`** — Trade/Store Order 전용 목록 화면(도메인 캐너리)이 마운트 시 1회 fetch만 하고 실시간 갱신이 전혀 없었던 문제. `components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch.ts` 신설, bus 이벤트(`cm.room.incoming_message`/`message_sent`/`read`/`summary_patch`) 구독해서 캐시 patch. 테스트 통과, 배포됨.
- **`c946e6cfe`** — Hub(하단 채팅탭) 뱃지가 3곳(realtime bus 즉시계산 / 뱃지카운트 폴링 / mark_read 응답)에서 각각 비동기로 쓰기 때문에, 늦게 시작했지만 늦게 도착한 요청이 최신 값을 덮어쓰는 out-of-order race가 있었음. `lib/chats/owner-hub-badge-store.ts`에 `capturedAt`(요청 발신 시각) 기반 high-water-mark 가드 추가. **이건 Hub 표면 1곳만 고친 것** — Bell/App Icon은 아래 2번 참고.

---

## 2. 구현은 됐지만 미커밋 — 지금 워킹트리에 그대로 남아 있음

`git status --porcelain` 확인 결과 다음 4개 파일이 **아직 커밋 안 된 변경사항**으로 남아 있음:

```
 M lib/messenger/contracts/domain-badge-authority-product-bridge.ts
 M lib/messenger/contracts/domain-badge-surface-store.ts
 M lib/notifications/__tests__/notification-badge-count-store.test.ts
 M lib/notifications/notification-badge-count-store.ts
```

내용: Hub와 동일한 `capturedAt` out-of-order 가드를 **Bell(종 알림)**과 **App Icon(missedCall 포함)** 표면에도 적용. 새 테스트 파일 2개도 미추적 상태:
- `lib/messenger/contracts/__tests__/domain-badge-surface-store-capturedat.test.ts`
- `lib/messenger/contracts/__tests__/domain-badge-authority-capturedat-wiring-contract.test.ts`

**중요 — 반드시 확인할 것:** 이 변경은 지금 이 레포에 커밋된 적이 없다. 즉 사용자가 실기기에서 "종/앱아이콘 수정 포함 배포본"이라고 보고한 그 빌드에는 **이 diff가 들어 있을 수 없다.** 사용자 보고와 실제 git 상태가 어긋난다 — 배포 파이프라인(Vercel/앱스토어 빌드)이 어느 커밋을 기준으로 만들어졌는지 먼저 확인 필요. 이 어긋남을 풀지 않고 다음 단계로 넘어가면 또 "고쳤는데 안 고쳐졌다"는 보고가 반복될 위험이 큼.

**할 일:**
1. 위 4개 파일 diff를 `git diff`로 직접 검토 (아래 커밋 메시지 초안 참고).
2. `npx vitest run lib/notifications/__tests__/notification-badge-count-store.test.ts lib/messenger/contracts/__tests__/domain-badge-surface-store-capturedat.test.ts lib/messenger/contracts/__tests__/domain-badge-authority-capturedat-wiring-contract.test.ts` 실행 (Claude 쪽 샌드박스는 `@rollup/rollup-linux-arm64-gnu` 누락으로 vitest 자체가 실행 불가해서 이 세션에서 실제 실행 결과를 못 봤음 — 반드시 여기서 처음 실행해서 확인).
3. 전체 `npm run lint` / `tsc --noEmit` / i18n-check / `npm run build`.
4. 통과하면 커밋 (`fix(messenger): reject out-of-order domain_authority bell/app-icon applies`), push.
5. **배포 후** 위 1번 항목 어긋남 해소 차원에서, 사용자에게 "이 커밋 해시 이후 빌드에서 재현되는지"를 명시적으로 재확인 요청.

---

## 3. 미착수 — 코드 자체를 아직 건드리지 않음

### 3-1. 일반/그룹 도메인 방별(per-room) 뱃지 "읽음 후 재등장" / "실시간 반영 안 됨"

이게 사용자가 지금 겪는 증상과 가장 가까운 후보다. 관련 서브시스템(전부 미수정, 자체 테스트 스위트 있음):

- `lib/community-messenger/read/local-read-guard.ts` — 방 진입/읽음 직후 20초(`LOCAL_READ_GUARD_TTL_MS`) 동안 서버발 stale unread를 억제하는 가드. `shouldSuppressStaleUnread()`(81-98행), `resolveUnreadWithLocalReadGuard()`(101-119행)가 `incomingLastMessageAt` 문자열을 가드 시점 기준 `referenceLastMessageAt`과 **문자열 비교**(`localeCompare`, 33-38행)로 새/구 판단. **20초가 지나면 가드가 그냥 사라지고(91, 112행) 그 이후 들어오는 값은 무조건 통과** — 즉 방을 읽은 지 20초 넘게 지난 시점에 stale한 unread 재계산이 한 번이라도 발생하면 뱃지가 되살아날 수 있는 구조. "읽었는데 잠시 후 다시 뱃지가 뜬다" 증상과 정확히 일치하는 코드 경로.
- `lib/community-messenger/consistency/messenger-consistency-merge.ts` — `resolveMessengerUnreadMerge()`(90행), `duplicate_event_discard`(108/121행) / `stale_version_discard`(176행) 두 판정 경로. 버전 비교는 `messenger-consistency-version.ts`의 `getRoomTruthVersionMs`를 사용 — **local-read-guard와는 다른 시간 축(메시지 타임스탬프 버전 vs read 시각)**을 쓴다. 두 메커니즘이 같은 방의 unread를 각각 다른 기준으로 판단하고 있어서, 어느 한쪽만 통과시키는 이벤트가 있으면 두 소스가 불일치할 수 있음 — 아직 실측/재현 안 됨, 가설 단계.
- `lib/community-messenger/merge-critical-home-sync-room-summary.ts` — `noteHomeListServerUnreadIncrease`/`peekRecentHomeListServerUnreadIncrease`/`clearHomeListServerUnreadIncrease`. local-read-guard의 "억제"를 뚫고 진짜 서버측 unread 증가를 인정하는 예외 통로. 이 통로가 잘못 트리거되면(진짜 새 메시지가 아닌데 예외로 인정) "억제됐던 뱃지가 이유 없이 재등장"이 재현될 수 있음 — 역시 미실측.
- `lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts` — 283행 `getDomainRoomStateSnapshot()`을 참조해서 리스트 행 상태를 강제 동기화하는 effect가 별도로 존재(584행 `mergeParticipantUnreadDeltaIntoHomeListRoom`, 818행 `applyHomeListSummaryPatchUnread` 호출 지점). 이 store가 위 두 메커니즘과 다시 별도로 값을 밀어넣는 **세 번째 쓰기 경로**로 보임 — 셋 사이에 캡처 시각 기반 순서 보장이 전혀 없음(Hub/Bell/App Icon에 적용한 `capturedAt` 패턴이 여기엔 없음).

**작업 방향 제안(승인 필요, 아래는 가설이지 확정 설계 아님):** 위 3~4개 쓰기 경로 각각이 언제(TTL 만료 직후, consistency-merge 판정 실패, home-sync force-sync effect 트리거) 값을 되돌리는지 **먼저 실기기/로컬에서 재현 로그**(각 파일에 이미 있는 `cmReadBadgeLog` 등 디버그 로거 활용, `NEXT_PUBLIC_CM_READ_BADGE_DEBUG=1`)로 캡처한 뒤, 진짜 원인 하나를 좁혀서 고칠 것. **재현 로그 없이 셋 중 아무거나 먼저 고치는 방식은 금지** — 이미 과거 이력에 이 뱃지 관련 patch→revert가 반복된 파일들(`git log --oneline --all --grep=badge`)이라 추측성 수정은 또 revert될 위험이 크다.

### 3-2. 채팅방 진입이 여러 단계처럼 보이는 문제

방 하나 진입 시 관여하는 컴포넌트 19개(전부 미수정, 구조만 인벤토리됨):

```
CommunityMessengerRoomPass0Shell.tsx
CommunityMessengerRoomPass1ComposerShell.tsx
CommunityMessengerRoomPass1StableShell.tsx
CommunityMessengerRoomStableEntryShell.tsx (+ Light 변형)
CommunityMessengerRoomRouteEntryShell.tsx
CommunityMessengerRoomBootstrapGate.tsx
CommunityMessengerRoomPhase2.tsx / Phase2Header / Phase2Composer
CommunityMessengerRoomClientPhase2Body.tsx
DomainRoomReadCanaryGate.tsx / Context.tsx
```

이 중 어느 게 실제로 "여러 번 들어오는 것처럼 보이는" 리렌더/리마운트를 유발하는지는 **화면 녹화 또는 React DevTools Profiler로 마운트/언마운트 타임라인을 직접 봐야 확정 가능** — 코드만 읽어서는 어떤 Pass가 실제로 사용자 눈에 "재진입처럼" 보이는지 특정이 안 됨. 이 세션(Claude, 코드 편집 도구만 있고 브라우저/디바이스 화면을 볼 수 없는 샌드박스)에서는 이 부분을 확정할 방법이 없음.

**작업 방향 제안:** Chrome DevTools Performance 탭 또는 React Profiler로 실제 방 진입 1회를 녹화해서, 위 19개 컴포넌트 중 몇 개가 몇 번 mount/update 되는지부터 데이터로 확인. 그 다음에만 통폐합 대상을 정한다. 프로파일링 없이 구조를 먼저 손대는 건 반대.

---

## 4. Claude가 이 두 항목(3-1, 3-2)을 직접 코드로 구현하지 않고 넘기는 이유

- 3-1은 이미 자체 테스트 스위트가 있는 성숙한 서브시스템이고, 세 개 이상의 서로 다른 시간 축(local-read-guard TTL, consistency-merge 버전, home-sync force-sync)이 얽혀 있어 **재현 로그 없이 셋 중 하나를 추측으로 고치면 다른 걸 깨뜨릴 위험이 매우 높음.** 이 세션엔 vitest 자체가 실행 안 되는 샌드박스 제약(`@rollup/rollup-linux-arm64-gnu` 누락, npm 레지스트리 403)까지 겹쳐서, 고쳐도 그 자리에서 회귀 테스트를 돌려 확인할 수 없음.
- 3-2는 시각적 재현(리렌더 타임라인)이 confirm의 전제조건인데, 이 세션은 코드 파일 Read/Write/Edit만 가능하고 브라우저/디바이스 화면을 볼 수 없음 — "몇 번째 Pass가 재진입처럼 보이는지"를 코드만 읽어서 단정하는 건 추측이 되고, 사용자가 명시적으로 금지한 "추측 구현"에 해당함.
- 사용자가 "그래도 지금 여기서 시도"라고 확인했지만, 그 시도의 결과가 검증 불가능한 상태로 방치되면(테스트 못 돌림, 화면 못 봄) 결과적으로 또 "고쳤다는데 안 고쳐졌다"만 반복하게 됨 — 그래서 실제 검증이 가능한 Cursor(vitest/디바이스 접근 가능)로 넘기는 게 맞다고 판단.

---

## 5. 완료 조건 (Acceptance) — 전체

1. §2의 미커밋 Bell/App Icon capturedAt 수정: vitest 실제 실행 통과 확인 + lint/tsc/i18n/build 통과 + 커밋/푸시.
2. §2의 "배포 빌드 커밋 어긋남" 확인 및 사용자에게 재보고.
3. §3-1: 재현 로그로 실제 트리거 지점 특정 후, 그 지점만 최소 수정. 수정 후 반드시 실기기(또는 최소 로컬 재현 스크립트)로 "읽음 → 20초+ 대기 → 뱃지 재등장 안 함"을 직접 확인.
4. §3-2: 프로파일링 데이터로 재진입처럼 보이는 원인 컴포넌트 특정 후에만 구조 변경 착수.
