import type { Metadata } from "next";
import { MySubscriptions } from "@/components/MySubscriptions";
import { plans } from "@/data/plans";

export const metadata: Metadata = { title: "我的订阅 · AI 套餐追踪" };

export default function MinePage() {
  return (
    <>
      <h1>我的订阅与重叠检查</h1>
      <p className="lead">
        勾选你正在付费的档位，看每月一共花多少、哪些能力被重复购买。数据只保存在你的浏览器里，不需要登录，也不需要任何账号。
      </p>
      <MySubscriptions plans={plans} />
    </>
  );
}
