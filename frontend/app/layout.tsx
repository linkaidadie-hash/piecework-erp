import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "中小企业生产系统",
  description: "中小企业生产、库存、工单和计件工资管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
