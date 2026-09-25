import { HomeTabs } from "@/components/HomeTabs";
import { apiModels } from "@/data/apiModels";
import { CNY_PER_USD, plans } from "@/data/plans";

export default function Home() {
  const official = plans.filter((p) => p.verification === "official").length;
  const officialApi = apiModels.filter((m) => m.verification === "official").length;
  return (
    <>
      <h1>AI 订阅和 API，哪些便宜、哪些贵</h1>
      <p className="lead">
        {plans.length} 个个人订阅档位按月价分档，{apiModels.length} 个 API 模型按每百万 token 价格分档，颜色越深越贵。数据核对于
        2026-09-25；其中 {official} 个订阅档位和 {officialApi} 个 API 模型已对照官方页面核对，其余标注「待核实」。
      </p>
      <HomeTabs plans={plans} apiModels={apiModels} cnyRate={CNY_PER_USD} />
    </>
  );
}
