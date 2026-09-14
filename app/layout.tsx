import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUMIA · 이터널 리턴 전적 분석실",
  description:
    "이터널 리턴 전적을 검색하고, 기록에 근거한 개인 플레이 리뷰를 받아보세요.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
