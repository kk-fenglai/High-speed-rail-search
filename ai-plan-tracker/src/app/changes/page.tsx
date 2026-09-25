import type { Metadata } from "next";
import { ChangeLog } from "@/components/ChangeLog";
import { changes } from "@/data/changes";
import { plans } from "@/data/plans";

export const metadata: Metadata = { title: "套餐变更日志 · AI 套餐追踪" };

export default function ChangesPage() {
  return (
    <>
      <h1>套餐变更日志</h1>
      <p className="lead">
        各家额度规则的每一次修改，都附有原文出处。事实（变更前后）和解读分开展示。在「我的订阅」里勾选你的档位后，这里会标出影响你的变更。
      </p>
      <ChangeLog changes={changes} plans={plans} />
    </>
  );
}
