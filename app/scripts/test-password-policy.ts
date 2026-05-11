import { checkPasswordStrength } from "../lib/crypto/password-policy";

interface Case {
  pw: string;
  ctx?: { email?: string; name?: string };
  shouldPass: boolean;
  reason: string;
}

const cases: Case[] = [
  // FAIL cases
  { pw: "", shouldPass: false, reason: "empty" },
  { pw: "short1!", shouldPass: false, reason: "<12 chars" },
  { pw: "abcdefghijklmnop", shouldPass: false, reason: "only lowercase (chỉ 1 loại)" },
  { pw: "Password1234", shouldPass: false, reason: "common pattern" },
  { pw: "AAAAAAAaaaaa1!", shouldPass: false, reason: "repeated chars" },
  { pw: "MyName2026!ABC", ctx: { name: "Nguyễn Văn Myname" }, shouldPass: false, reason: "chứa tên" },
  { pw: "AB12345Cd!XYZ", shouldPass: false, reason: "sequential 12345" },

  // PASS cases
  { pw: "Tr4n#Phu@2026Sec", shouldPass: true, reason: "12+ chars, 4 loại" },
  { pw: "K1nht3-Ph0ng#XK", shouldPass: true, reason: "complex non-sequential" },
  { pw: "B!nhM1nhSau$2026", shouldPass: true, reason: "Vietnamese name-like, complex" },
];

let failures = 0;
for (const c of cases) {
  const r = checkPasswordStrength(c.pw, c.ctx || {});
  const ok = r.ok === c.shouldPass;
  console.log(
    (ok ? "✓" : "✗") +
      ` [${c.reason}] pw="${c.pw}" → ok=${r.ok} strength=${r.strength}` +
      (r.errors.length ? "\n   " + r.errors.join(" | ") : "")
  );
  if (!ok) failures++;
}
console.log(`\n${failures === 0 ? "✓ All policy tests passed" : "✗ " + failures + " failures"}`);
process.exit(failures === 0 ? 0 : 1);
