import fs from "fs";
const p = "lib/i18n/catalog/navigation.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  'nav_messenger_cannot_kick_admin: "\uad00\ub9ac\uc790\ub294\ub0b4\ubcfc',
  'nav_messenger_cannot_kick_admin: "\uad00\ub9ac\uc790\ub294 \ub0b4\ubcfc'
);
// Fix: was missing \ub0b4 (내) - use explicit correct strings
s = s.replace(
  /nav_messenger_cannot_kick_admin: "[^"]+"/,
  'nav_messenger_cannot_kick_admin: "\uad00\ub9ac\uc790\ub294 \ub0b4\ubcfc \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."'
);
s = s.replace(
  /nav_messenger_self_kick_forbidden: "[^"]+"/,
  'nav_messenger_self_kick_forbidden: "\uc790\uae30 \uc790\uc2e0\uc740 \ub0b4\ubcfc \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."'
);
fs.writeFileSync(p, s);
console.log("fixed");
