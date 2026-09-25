import { PriceBoard } from "@/components/PriceBoard";
import { CNY_PER_USD, plans } from "@/data/plans";

export default function Home() {
  const checked = plans.map((p) => p.checkedAt).sort().at(-1);
  const official = plans.filter((p) => p.verification === "official").length;
  return (
    <>
      <h1>AI 订阅，哪些便宜、哪些贵</h1>
      <p className="lead">
        {plans.length} 个个人付费档位按月价分成四档，颜色越深越贵。选一类能力，就能看到这类能力最便宜从多少钱起。数据核对于 {checked}，其中{" "}
        {official} 个已对照官方页面核对。
      </p>
      <PriceBoard plans={plans} cnyRate={CNY_PER_USD} />
    </>
  );
}
