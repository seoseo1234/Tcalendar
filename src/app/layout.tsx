import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T-Calendar | 교사용 AI 일정 관리",
  description: "메시지와 사진에서 일정을 찾아주는 교사용 AI 캘린더",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
