DIBAY Play Internal Testing — 업로드용 AAB (재감사 복원본)

지금 올릴 파일 (V4 ONLY):
  dibay-play-fix-localhost-versionCode4-1.2.1.aab

package: com.dibay.app
versionCode: 4
versionName: 1.2.1
sha256: b420b4bb563ac88264bb9d037e06ae566c911df84a6c096d36da27fa353a9d7f
server.url (AAB 내장 재검증 PASS): https://samarket.vercel.app
Native plugin strings present: DibayPlayInAppUpdate / getInstalledVersion / startFlexibleUpdate

경로:
  /Users/bkkim/projects/samarket/reports/android-play-in-app-update/

Finder:
  open /Users/bkkim/projects/samarket/reports/android-play-in-app-update

금지:
  versionCode 3 AAB (capacitor.config.json 누락 → https://localhost/) — 재사용 금지
  sha256 V3: b31981cad3a3f32f4dfaef935fa246e1ad0f428facf6f59de6c69b5d38832d6b

주의:
  이 AAB는 worktree 빌드 산출물에서 복원·재검증됨. Play Console 출시 여부는 Owner 확인 필요 (NOT_PROVEN).
