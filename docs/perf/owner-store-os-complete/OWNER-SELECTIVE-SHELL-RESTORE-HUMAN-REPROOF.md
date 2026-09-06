# Owner SELECTIVE_SHELL_RESTORE — Domain human re-proof log

**Code SHA (pre-ship):** see commit after gates  
**Authority:** Human Production usability. Automation PASS ≠ CLOSED.

## Code-level gates completed (this turn)

| Domain | Code change | Human runtime |
|---|---|---|
| Shell / Header / Scroll / BottomNav / Overlay / Preview / Transition | Implemented SSOT | **NOT_PROVEN** until Production human session |
| Product CREATE/EDIT | Shared scroll + BottomNav hide + back→products | NOT_PROVEN |
| Store basic-info/profile | KEEP fields; BottomNav hide | NOT_PROVEN |
| Orders / Order-chats | ScrollShell | NOT_PROVEN |
| Ads CREATE | BottomNav hide | NOT_PROVEN |
| Notifications | Dual header removed | NOT_PROVEN |
| Store Preview | Modal + buyer URL embed | NOT_PROVEN |
| Finance / Customer / Reviews | KEEP (no field loss Day-0) | NOT_PROVEN |

## Forbidden PASS claims (not used)

- Vercel Ready alone
- DOM presence / API 200 alone
- Chromium-only
- `HTMLAudioElement.play()` alone

## Next required for CLOSED

1. Web Production human proof PASS  
2. Android authenticated runtime + physical NEW ORDER sound PASS  
3. iOS authenticated runtime + physical NEW ORDER sound PASS  

If iOS locked: `IOS = NOT_PROVEN`, `UNRESOLVED = IOS_DEVICE_LOCKED`, overall **FAIL / NOT CLOSED**.
