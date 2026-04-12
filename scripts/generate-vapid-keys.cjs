/* eslint-disable no-console */
const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();

console.log("--- SAMarket Web Push VAPID ---\n");
console.log("아래를 .env / 호스팅 시크릿에 넣고, WEB_PUSH_ENABLED=1 로 켭니다.\n");
console.log(`WEB_PUSH_ENABLED=1`);
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`\n(선택) VAPID_SUBJECT=mailto:you@example.com\n`);
