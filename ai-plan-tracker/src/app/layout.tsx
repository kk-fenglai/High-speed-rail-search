import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 套餐价格一览",
  description: "一眼看清各家 AI 订阅哪些便宜、哪些贵，追踪套餐规则变更，检查订阅重叠。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <div className="wrap">
            <span className="brand">AI 套餐追踪</span>
            <Nav />
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            非任何 AI 厂商官方网站，与各厂商无关联。价格与额度以厂商官网为准；标注「待核实」的数据尚未对照官方页面复核。本站不接任何推广佣金。
          </div>
        </footer>
      </body>
    </html>
  );
}
