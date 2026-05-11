// Test AI assistant trên Vercel production - login + chat 1 câu để verify pipeline.

const BASE = "https://phong-kinh-te.vercel.app";
const EMAIL = "tuan.vv@phongkinhte-tranphu.vn";
const PASSWORD = "ChangeMe@2026";

async function main() {
  console.log(`Base: ${BASE}\n`);

  // 1. Sign-in qua Better Auth API
  console.log("1. Login...");
  const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: BASE,
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  console.log(`   Status: ${loginRes.status}`);
  if (!loginRes.ok) {
    const txt = await loginRes.text();
    console.error("   Login failed:", txt.slice(0, 300));
    process.exit(1);
  }
  // Extract cookie
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) {
    console.error("   No cookie in response");
    process.exit(1);
  }
  // Vercel có thể trả nhiều cookie - split & rejoin
  const cookieStr = setCookie.split(",").map((c) => c.split(";")[0].trim()).join("; ");
  console.log("   ✓ Cookie obtained\n");

  // 2. Test /api/ai/status
  console.log("2. Check AI status...");
  const statusRes = await fetch(`${BASE}/api/ai/status`, {
    headers: { Cookie: cookieStr },
  });
  console.log(`   Status: ${statusRes.status}`);
  const statusData = await statusRes.json();
  console.log("   Data:", JSON.stringify(statusData));
  console.log();

  // 3. Test chat
  console.log("3. Send chat: 'hôm nay tôi có việc gì không'");
  const t0 = Date.now();
  const chatRes = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieStr,
    },
    body: JSON.stringify({ question: "hôm nay tôi có việc gì không" }),
  });
  console.log(`   Status: ${chatRes.status}`);
  if (!chatRes.ok || !chatRes.body) {
    const txt = await chatRes.text();
    console.error("   Chat fail:", txt.slice(0, 500));
    process.exit(1);
  }

  // Read SSE stream
  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let toolCallCount = 0;
  let pendingActionCount = 0;
  let conversationId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const obj = JSON.parse(data);
        if (obj.text) fullText += obj.text;
        if (obj.toolCall) {
          if (obj.toolCall.status === "running") toolCallCount++;
        }
        if (obj.pendingAction) pendingActionCount++;
        if (obj.conversationId) conversationId = obj.conversationId;
      } catch {}
    }
  }
  const elapsed = Date.now() - t0;

  console.log(`   Elapsed: ${elapsed}ms`);
  console.log(`   Tool calls: ${toolCallCount}`);
  console.log(`   Pending actions: ${pendingActionCount}`);
  console.log(`   Conversation ID: ${conversationId}`);
  console.log(`\n   AI Response (${fullText.length} chars):`);
  console.log("   " + "─".repeat(70));
  console.log(fullText.split("\n").map((l) => "   " + l).join("\n"));
  console.log("   " + "─".repeat(70));
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
