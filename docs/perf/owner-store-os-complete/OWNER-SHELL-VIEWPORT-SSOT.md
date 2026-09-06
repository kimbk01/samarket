# Owner shell viewport SSOT (current)

**Decision:** keep selective restore direction; replace stacked height 땜빵 with one CSS contract.

## Production failure (`f7a9b8dc3`)

Nested `data-owner-stack-shell` on outer **and** inner div → dual `100dvh` → Product scroll dead.

## Contract (this fix)

1. **ONE** `.owner-stack-shell` on outermost Owner stack root only  
2. Height lock in `app/owner-compact-shell.css` (not dynamic Tailwind `h-[100dvh]`)  
3. Inner column = `flex-1 min-h-0` only  
4. Page scroll = `.owner-compact-shell__scroll` (`OwnerAdminPageScrollShell`)  
5. `--owner-header-height: 3.5rem` (matches `h-14` stack headers; not consumer 52px)  
6. Product CREATE/EDIT: BottomNav hidden; no dual top `pt-[calc…]`

## Keep

- `6ca1b3d46` dual-pt removal / BottomNav hide / Product ScrollShell  
- Business fixes outside shell geometry

## Do not

- Nested 100dvh roots  
- `${OWNER_COMPACT_SHELL_MAX_TW}:h-[100dvh]`  
- Page-local pb/pt height hacks
