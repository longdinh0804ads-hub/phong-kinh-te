import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Noto_Sans } from "next/font/google";
import "./globals.css";

// Body font: Be Vietnam Pro — modern, mềm mại, thiết kế riêng cho tiếng Việt
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

// Fallback giữ lại Noto Sans nếu Be Vietnam load chậm
const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Phòng Kinh Tế - Xã Trần Phú",
  description: "Hệ thống quản lý nội bộ Phòng Kinh Tế Xã Trần Phú, Hà Nội",
  applicationName: "PKT Trần Phú",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.svg",
    apple: "/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1e3a8a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${notoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
