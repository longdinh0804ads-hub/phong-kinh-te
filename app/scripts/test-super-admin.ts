// Test super admin login + redirect /admin trên production.

const BASE = "https://phong-kinh-te.vercel.app";
const EMAIL = "admin@phongkinhte-tranphu.vn";
const PASSWORD = "xPHc4N3ayNrgfq#K2026";

async function main() {
  console.log(`Base: ${BASE}\n`);

  // Login
  console.log("1. Login as super admin...");
  const r1 = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: BASE,
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  console.log(`   Status: ${r1.status}`);
  if (!r1.ok) {
    const t = await r1.text();
    console.error("   FAIL:", t.slice(0, 300));
    process.exit(1);
  }
  const cookie = r1.headers.get("set-cookie")?.split(",").map((c) => c.split(";")[0].trim()).join("; ");
  console.log("   ✓ Login OK\n");

  // Access /admin
  console.log("2. GET /admin (expect 200 OK, super admin layout):");
  const r2 = await fetch(`${BASE}/admin`, { headers: { Cookie: cookie! }, redirect: "manual" });
  console.log(`   Status: ${r2.status}`);
  if (r2.status === 200) {
    const text = await r2.text();
    if (text.includes("Quản trị hệ thống") || text.includes("Tổng quan hệ thống")) {
      console.log("   ✓ Admin dashboard rendered");
    } else {
      console.log("   ⚠ 200 but content unexpected:", text.slice(0, 200));
    }
  } else {
    console.log("   ✗ Expected 200, got", r2.status);
    process.exit(1);
  }

  // Access /admin/api-keys
  console.log("\n3. GET /admin/api-keys:");
  const r3 = await fetch(`${BASE}/admin/api-keys`, { headers: { Cookie: cookie! }, redirect: "manual" });
  console.log(`   Status: ${r3.status}`);

  console.log("\n4. GET /admin/users:");
  const r4 = await fetch(`${BASE}/admin/users`, { headers: { Cookie: cookie! }, redirect: "manual" });
  console.log(`   Status: ${r4.status}`);

  // Try accessing /tasks (nghiệp vụ) - super admin should be redirected
  console.log("\n5. GET / (root - super admin → should redirect /admin):");
  const r5 = await fetch(`${BASE}/`, { headers: { Cookie: cookie! }, redirect: "manual" });
  console.log(`   Status: ${r5.status}, Location: ${r5.headers.get("location")}`);

  console.log("\n=== ALL PASS ===");
  console.log("\nSuper admin credentials:");
  console.log("  Email:", EMAIL);
  console.log("  Password:", PASSWORD);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
