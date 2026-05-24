import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "计件生产管理系统",
  description: "生产工单、库存、计件工资和老板看板",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
