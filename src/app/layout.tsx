import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "T-Calendar | 교사용 AI 일정 관리",
  description: "메시지와 사진에서 일정을 찾아주는 교사용 AI 캘린더",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const terms = readFileSync(path.join(process.cwd(), "이용약관.md"), "utf8");
  const privacy = readFileSync(path.join(process.cwd(), "개인정보처리방침.md"), "utf8");
  return (
    <html lang="ko">
      <body>{children}<SiteFooter terms={terms} privacy={privacy} /></body>
    </html>
  );
}
