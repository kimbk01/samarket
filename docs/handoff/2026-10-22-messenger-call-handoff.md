# 인수인계 — DIBAY 메신저·통화 작업 (2026-10-22 · 이전 세션 → 새 클라우드 코드 세션)

이 문서를 **처음부터 끝까지 읽고** 시작한다. 이전 세션은 Owner 신뢰를 잃었다. 같은 실수를 반복하지 않는 것이 이 인수인계의 목적이다.
위치: 작업 브랜치 `claude/keen-ramanujan-1iwx5z` · 저장소 `kimbk01/samarket` · 운영 Supabase `ckdosyydvgzqwpbwuhon`(읽기 전용 조회만 · `dibay-test`·`dibay-reset-qa` 사용 금지).
보고는 **한글**, 짧게. 시간은 PHT(Asia/Manila). `AGENTS.md`(특히 「절대 금지」·「통화 변경 규정」·「개발 프로세스」) 가 최상위 규칙이다.

---

## 1. Owner 의 원래 의도 (2026-10-21 첫 지시)
- DIBAY 메신저·친구·대화·통화를 **카카오톡·텔레그램·바이버 수준**으로 만든다.
- 고정 절차: **전체 감사 → 결함 보고 → 통합 개선 설계 → Owner 승인 → 구현 → Cursor·Owner 실기기 검증 → 최종 완료 판정.** 승인 전 코드·DB·네이티브 변경·병합·배포 금지.
- 네이티브·iOS 는 「수정 금지」가 아니라 **수정 필요성·영향·회귀 위험·실기기 검증 방법을 먼저 입증한 뒤 신중히** 수정하는 대상.
- Owner 확정 정책(D1~D7): 차단은 일반 1:1 만(주문·거래 채팅 유지) · 차단 시 차단자 쪽만 방 숨김 · 모바일 Enter=줄바꿈/전송 버튼만 · 통화 중 시도는 「통화 중」으로 기록(벨·푸시 없음) · 오픈그룹 강퇴 제외 · DB 마이그레이션은 1건씩 Owner 승인 후 · 네이티브 생명주기와 UI 는 분리 검증. 통화 12상태(취소·거절·통화중·연결불가·무응답·연결실패·연결·품질저하·재연결·재연결실패·정상종료·비정상종료) 구분, 중요한 실패는 중앙 공통 팝업.
- 친구(Owner 추가 요구): **요청 → 상대에게 가운데 팝업으로 수락/거절 → 수락 시 양쪽 친구 목록.** 추가 모달은 하단 시트가 아니라 **가운데 팝업**. (현재 코드는 일방 추가 = 「Telegram Contact LOCK」 설계 — Owner 요구와 다름, 미착수)

## 2. 무엇이 잘못됐나 (이전 세션의 실패 — 반복 금지)
1. **실기기 증거 없이 코드 감사·추측만으로 대량 변경을 main 에 올렸다** (10-21 `43facb1a` 120개 파일 WIP, 10-22 `a3b298f2` 53개 파일 등). 「완성도 올리기」 명목으로 범위를 넓혔고 결과적으로 Owner 가 「처음 상태가 가장 완성됐다」고 판정.
2. **결함이 나올 때마다 한 건씩 땜빵**: 통화 푸시 순서 → 늦은 링 차단 → 알림 생략 → 되돌림 → 받은 기기 제외 → 발송 규칙 … 매번 새 문제.
3. **Production 확인 실패**: 배포 SHA 를 확인하지 않고 테스트 → 다른 버전 결과 혼합. (해결법: 앱 「설정 → 버전 정보」 의 웹 배포 SHA 가 정본)
4. **iOS 수정을 main 에 올리지 않은 채 Xcode 재설치를 안내** → 수정 안 된 1.2 (7) 이 설치됨. (Xcode 설치는 **main 의 코드**로만 하고, 빌드 번호를 먼저 올린다)
5. **설계 빈틈**: 앱 재설치마다 iOS 기기 ID 가 바뀌어 옛 `user_devices` 행이 「사용 중」으로 남는다 → 기기 ID 로 비교한 알림 생략 규칙이 실기기에서 실패. 알면서 미뤘다.
6. 핑계성 표현(「원래 있던 문제」) — Owner 는 결함을 고치라고 한 것. 책임을 흐리지 말 것.
7. 기기 조작 불가를 늦게 설명: **클라우드 세션은 Mac·폰을 만질 수 없다.** 실기기는 「Mac 로컬(이 컴퓨터) Claude Code 세션」 또는 Cursor 가 한다.

## 3. 현재 상태 (인수 시점)
### 3-1. main(Production)
- 최신 `539dfd22`. 이전 세션의 메신저·통화 **코드 커밋 12개**가 main 에 있다: `43facb1a` `07a89cb0` `2a95851f` `137b8c01` `155b73c3` `a3b298f2` `0ed7d78f` `4044eb46` `cf12ba2a` `a925273c` `a0777955` `539dfd22`.
- 다른 세션(로그인, session `012Nuk…`) 코드 커밋 8개: `8a2c8b48` `961a4dec` `b0e5b246` `07cb2902` `1f8973db` `b4fc432b` `297e08d0` `5b6100f4` — **절대 건드리지 않는다.**
- 운영 DB: 이전 세션이 적용한 것 **없음**(마이그레이션 4건은 작업 브랜치 파일만).
- iPhone 설치: 1.2 (7) (원래 빌드). Android 1.2.4 (11).
### 3-2. ★ Owner 최종 지시: 「처음으로 되돌려라 — 이전 세션이 만든 부분만, 다른 세션 수정은 건드리지 말 것」
- 되돌림 기준점: `a44a9d1b` (이전 세션 첫 커밋 직전 main).
- 대상: 이전 세션 코드 커밋 12개가 바꾼 **코드 파일 178개** = `docs/handoff/2026-10-22-rollback-files.txt` (문서·`AGENTS.md`·`.cursor` 제외).
- 이전 세션이 검증한 사실: 이 178개 파일과 다른 세션 코드 파일의 **겹침 0개**. 병합 등 다른 경로로 바뀐 코드 파일 0개.
- 준비된 결과(이전 세션 worktree, 미푸시): 112개 `a44a9d1b` 내용으로 복원 · 61개 삭제(기준점에 없던 파일) · 5개 해당 없음(main 에 없음). 복원 파일 178개 기준점과 **불일치 0** · 기준점 대비 남는 코드 차이 28개는 **전부 다른 세션 파일**. `tsc` build·test PASS. vitest·lint 는 실행 중에 인수(결과 미확인).
- **새 세션이 할 일 = 되돌림 재현·검증·반영(아래 §4-1).** 아직 main 에 반영되지 않았다.
### 3-3. 작업 브랜치에만 있는 것(main 반영 금지 — 되돌림 이후 참고 자료)
- iOS 수정 `763f13dd`(모든 VoIP CallKit 보고·음성 상대 퇴장 정상 종료·스피커/음소거·토큰 재전달·빌드 8) · SSOT 잠금 `33e76af0` — **컴파일 미확인·실기기 미검증.**
- 보류 stash: 재설치 기기 ID 불일치 알림 생략 수정(미승인).
- 마이그레이션 4건(F-12·G-1·C-8·W5) 파일 + 로컬 검증 문서.
- 문서: `docs/dibay-messenger-full-audit-2026-10-21.md`(감사 1~4부) · `docs/audit/messenger-2026-10-22-call-fix-plan-v2.md`(통화 원인 증거) · `docs/audit/messenger-call-quality-master-plan-2026-10-22.md`(완성도 계획 초안) · `docs/audit/messenger-2026-10-22-call-scenario-observation.md`(실기기 시나리오) · `docs/audit/call-scenarios-2026-10-22/REPORT.md`(실기기 관찰 원문).

## 4. 새 세션이 할 일 (순서 고정 · 단계마다 Owner 보고 1회)
### 4-1. 되돌림 반영 (Owner 지시 — 최우선)
```
git fetch origin main claude/keen-ramanujan-1iwx5z
git worktree add /tmp/rb origin/main
git show origin/claude/keen-ramanujan-1iwx5z:docs/handoff/2026-10-22-rollback-files.txt > /tmp/rb-files.txt
# 각 파일: a44a9d1b 에 있으면 그 내용으로 checkout, 없으면 git rm (main 에 없으면 건너뜀)
```
검증(전부 통과해야 푸시):
1. 이 178개 파일이 `a44a9d1b` 와 바이트 동일(또는 없음).
2. `git diff a44a9d1b --name-only`(문서 제외) 가 **다른 세션 코드 파일만**(위 8개 커밋 파일) — 그 밖의 파일이 나오면 중단·보고.
3. **그 사이 main 에 새 커밋이 생겼으면** 그 커밋이 178개 파일을 건드렸는지 확인 — 건드렸으면 중단·Owner 보고(다른 세션 작업을 덮어쓰지 않는다).
4. `npm run typecheck:build` · `npx tsc -b tsconfig.test.json` · `npx vitest run lib/community-messenger lib/push lib/call lib/notifications components/community-messenger components/messenger components/push lib/messenger-policy lib/stores` · `npx eslint . --quiet` · `npm run verify:native-version-bump`(웹만이어야 함).
그 다음 커밋 1개 → `git push origin HEAD:main`(force 금지) → SHA 보고. 이전 세션이 만든 테스트도 같이 사라지므로 테스트 실패가 나면 「기준점 상태 그대로인지」부터 확인(기준점에서 원래 실패하던 것은 보고만).
보고: 되돌린 커밋 12개 · 파일 수 · 검증 결과 · main SHA · 「앱 재시작 후 앱 설정→버전 정보 웹 배포 SHA 확인」 안내.
### 4-2. 되돌린 상태 실기기 확인 (Owner 직접 + Mac 로컬 세션)
- Owner 가 평소처럼 통화·메시지를 써 보고 「처음 상태」 동작인지 확인. 이상이 있으면 **증거(callId·시각·스크린샷)** 만 받는다. 코드 수정 금지.
### 4-3. 완성도 작업 — **Owner 가 새로 지시할 때만**, 아래 방식으로만
1. **실기기 기준선 먼저**: 시나리오(통화 A~E, 메신저 M, 그룹 N, 배지·알림 O, 친구 P, 세션 Q — `messenger-call-quality-master-plan-2026-10-22.md` §2)를 Mac 로컬 세션이 실행·기록. 수정 없음.
2. 결함 목록 = **실기기 FAIL 로 재현된 것만** + 증거·원인 → Owner 승인.
3. 도메인 하나(통화 / 메시지 / 알림 / 친구)씩 설계 → 승인 → 구현 → 그 도메인 실기기 재검 PASS → 다음 도메인.
4. 한 번의 반영 = 한 원인. 대량 WIP·범위 확대·「개선 목적」 변경 금지.

## 5. 확정된 기술 사실 (증거 있음 — 재조사 불필요)
- **iOS VoIP 차단 메커니즘**(실기기 콘솔 원문, REPORT.md A1): 앱 자체 벨 타임아웃으로 CallKit 종료 → 0.5s 뒤 서버 `missed_call` VoIP → 앱 `ios_voip_terminal_already_suppressed ... completion_only`(CallKit 보고 없이 완료) → iOS 앱 강제 종료(SIGABRT) → `terminate 0xBAADCA11` → 이후 앱이 꺼짐·잠금이면 `will not be launched because it failed to report an incoming call too many times` + `VoIP push ... dropped on the floor`. **앱 삭제·재설치로만 풀린다.** 원인 2곳: 서버가 이미 끝난 통화의 iPhone 에 VoIP 를 보냄(`missed_call`·`call_ended`·`call_answered_elsewhere`·`call_rejected`) + 앱 `VoIPPushRegistry.swift` 의 보고 없는 완료 분기. 기준점(`a44a9d1b`) 코드에도 존재.
- iPhone 「전화 왔다」·「통화」 배너 = 서버가 VoIP 와 함께 `apns` 일반 알림(`sound: default`)을 보냄(7월부터). CallKit 화면과 중복.
- 음성 통화 중 상대가 끊으면 iOS 「통화를 시작하지 못했습니다」 빨간 배너 = iOS 네이티브 `NativeVoiceIncomingCallCoordinator.onDisconnected` 가 `mediaFailed` 로 처리(영상은 정상 종료로 처리).
- iPhone 음성 통화 스피커·음소거 버튼 = `NativeVoiceCallViewController` 가 버튼 모양만 바꿈.
- 재설치마다 iOS 기기 ID 가 바뀌고 옛 `user_devices` 행이 활성으로 남는다(같은 사람에게 알림 중복).
- 잠금 화면 CallKit 에 거절 버튼 없음 = iOS 표준(측면 버튼 2회). 결함 아님.
- 이 클라우드 환경: Vercel·운영 주소 접근 불가(403) → Production SHA 는 앱 「설정 → 버전 정보」 로 확인.

## 6. 역할과 도구
| 어디 | 무엇을 |
|---|---|
| **새 클라우드 코드 세션**(이 인수 대상) | 코드·git·운영 DB 읽기 조회·main 반영·보고. 기기는 못 만진다 |
| **Mac 로컬 Claude Code 세션** (Claude Desktop → 코드 → 새 세션 → 환경 「이 컴퓨터」 → samarket 폴더) | adb·logcat(Samsung `RFCY40PY2CA`·Xiaomi `8b37179f7d94`) · Xcode 콘솔·설치 · iPhone 미러링 · `npm run native:prepare` · 시나리오 실행 · 결과를 작업 브랜치에 REPORT 로 올림(별도 worktree, main 금지) |
| **Owner** | iPhone CallKit 받기·거절(미러링 불가)·잠금 화면 조작·소리 판단·승인 |
- 계정: Samsung `q테스트1` · iPhone `w테스트1`(user `edc8c2f0-…`) · Xiaomi `zxzx11`.
- iOS 설치: **main 의 코드 → `npm run native:prepare` 성공 → 앱 삭제 → Xcode Run** 뿐. 빌드 번호는 설치 빌드마다 1회.

## 7. 새 세션 첫 메시지(Owner 가 붙여넣기)
```
docs/handoff/2026-10-22-messenger-call-handoff.md 를 git show origin/claude/keen-ramanujan-1iwx5z:docs/handoff/2026-10-22-messenger-call-handoff.md 로 읽고 그대로 따른다.
지금 할 일은 §4-1 되돌림 반영 하나뿐이다. 이전 세션 코드 커밋 12개가 바꾼 파일(rollback-files.txt 178개)만 a44a9d1b 상태로 되돌리고, 다른 세션 수정은 한 줄도 건드리지 마라. 검증 4가지를 모두 통과해야만 main 에 1회 반영하고 SHA 를 한글로 짧게 보고해라. 그 밖의 수정·감사·제안 금지.
```
