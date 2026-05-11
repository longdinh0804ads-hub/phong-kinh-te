// Test request-fingerprint helper - không hit DB.
import {
  ipToSubnet,
  hashUserAgent,
  describeDevice,
  compareFingerprints,
} from "../lib/security/request-fingerprint";

console.log("--- ipToSubnet ---");
console.log("192.168.1.5 →", ipToSubnet("192.168.1.5"));
console.log("10.0.0.1 →", ipToSubnet("10.0.0.1"));
console.log("2001:db8:1234:5678::1 →", ipToSubnet("2001:db8:1234:5678::1"));
console.log("unknown →", ipToSubnet("unknown"));

console.log("\n--- hashUserAgent (cùng browser/OS = cùng hash) ---");
const chromeWin1 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const chromeWin2 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"; // version mới
const firefoxLinux = "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
const safariMac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const h1 = hashUserAgent(chromeWin1);
const h2 = hashUserAgent(chromeWin2);
const h3 = hashUserAgent(firefoxLinux);
const h4 = hashUserAgent(safariMac);
console.log("Chrome Win v130:", h1);
console.log("Chrome Win v131:", h2, h1 === h2 ? "(stable - version-agnostic ✓)" : "(BUG - khác)");
console.log("Firefox Linux  :", h3);
console.log("Safari macOS   :", h4);

console.log("\n--- describeDevice ---");
console.log(describeDevice(chromeWin1));
console.log(describeDevice(firefoxLinux));
console.log(describeDevice(safariMac));
console.log(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)"));

console.log("\n--- compareFingerprints ---");
const stored = {
  ipSubnet: "192.168.1.0/24",
  userAgentHash: h1,
  deviceId: "abc123",
};
// Match hoàn toàn
console.log(
  "Match:",
  compareFingerprints(stored, {
    ipAddress: "192.168.1.99",
    ipSubnet: "192.168.1.0/24",
    userAgent: chromeWin1,
    userAgentHash: h1,
    deviceId: "abc123",
  })
);
// IP đổi subnet
console.log(
  "IP đổi:",
  compareFingerprints(stored, {
    ipAddress: "10.5.5.5",
    ipSubnet: "10.5.5.0/24",
    userAgent: chromeWin1,
    userAgentHash: h1,
    deviceId: "abc123",
  })
);
// UA đổi (Firefox thay Chrome)
console.log(
  "UA đổi:",
  compareFingerprints(stored, {
    ipAddress: "192.168.1.99",
    ipSubnet: "192.168.1.0/24",
    userAgent: firefoxLinux,
    userAgentHash: h3,
    deviceId: "abc123",
  })
);
// Cả 3 đổi → revoke
console.log(
  "Cả 3 đổi:",
  compareFingerprints(stored, {
    ipAddress: "10.5.5.5",
    ipSubnet: "10.5.5.0/24",
    userAgent: firefoxLinux,
    userAgentHash: h3,
    deviceId: "xyz999",
  })
);
console.log("\n✓ Fingerprint helper OK");
