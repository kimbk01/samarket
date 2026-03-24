# `_isolated` — 시뮬·샘플·데모 전용 구역

**실서비스 앱·공용 API와 섞이지 않게** 두는 코드를 여기에 둡니다.

## 규칙

1. **신규** mock / 시뮬 / 관리자용 더미 데이터 → 가능하면 `lib/_isolated/<주제>/` 아래에만 추가합니다.
2. **기존** `lib/**/mock-*.ts`, `**/*-mock/**` 등은 import가 많아 한 번에 옮기기 어렵습니다. 해당 파일을 건드릴 때만 점진적으로 이쪽으로 옮기면 됩니다.
3. `app/(app)/`·`app/api/`에서 이 폴더를 import할 때는 반드시 `lib/config/deploy-surface.ts` 등으로 **production 노출을 막을지** 검토합니다.

## 실사용 코드 위치(참고)

- 앱 페이지: `app/(app)/`
- API: `app/api/`
- Cursor 규칙: `.cursor/rules/saMAKet-production-surface.mdc`
