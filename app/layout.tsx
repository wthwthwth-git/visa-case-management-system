import type { Metadata } from "next";
import { GlobalScrollbarActivity } from "./_components/global-scrollbar-activity";
import "./globals.css";

export const metadata: Metadata = {
  title: "签证案件资料管理系统",
  description: "事务所用签证案件资料管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <GlobalScrollbarActivity />
        {children}
      </body>
    </html>
  );
}
