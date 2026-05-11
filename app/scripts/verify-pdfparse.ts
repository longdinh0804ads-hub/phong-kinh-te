// Verify pdf-parse v2 exports - is PDFParse a real class?
async function main() {
  const mod = await import("pdf-parse");
  console.log("Module exports:", Object.keys(mod));
  console.log("Default export type:", typeof (mod as any).default);
  console.log("PDFParse type:", typeof (mod as any).PDFParse);
  if (typeof (mod as any).PDFParse === "function") {
    // Try to construct
    try {
      const buf = Buffer.from("dummy");
      new (mod as any).PDFParse({ data: buf });
      console.log("✓ PDFParse can be constructed (claim is wrong, code is OK)");
    } catch (e: any) {
      if (e.message?.includes("not a constructor")) {
        console.log("✗ PDFParse is NOT a constructor - bug confirmed");
      } else {
        console.log("PDFParse constructed but threw on dummy data:", e.message);
        console.log("(That's normal - PDFParse IS a class)");
      }
    }
  }
}
main().catch((e) => console.error(e));
