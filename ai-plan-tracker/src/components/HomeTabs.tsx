"use client";

import { useEffect, useState } from "react";
import type { ApiModel, Plan } from "@/data/types";
import { ApiBoard } from "./ApiBoard";
import { PriceBoard } from "./PriceBoard";

type View = "plans" | "api";

/** 订阅套餐和 API 按量计费放在同一页，用 URL hash（#api）记住当前视图，方便分享链接。 */
export function HomeTabs({ plans, apiModels, cnyRate }: { plans: Plan[]; apiModels: ApiModel[]; cnyRate: number }) {
  const [view, setView] = useState<View>("plans");

  useEffect(() => {
    const sync = () => setView(window.location.hash === "#api" ? "api" : "plans");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (v: View) => {
    setView(v);
    history.replaceState(null, "", v === "api" ? "#api" : window.location.pathname);
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label="计费方式">
        <button role="tab" aria-selected={view === "plans"} aria-controls="panel-plans" onClick={() => select("plans")}>
          订阅套餐（按月）
        </button>
        <button role="tab" aria-selected={view === "api"} aria-controls="panel-api" onClick={() => select("api")}>
          API（按 token）
        </button>
      </div>
      <div id="panel-plans" role="tabpanel" hidden={view !== "plans"}>
        <PriceBoard plans={plans} cnyRate={cnyRate} />
      </div>
      <div id="panel-api" role="tabpanel" hidden={view !== "api"}>
        <ApiBoard models={apiModels} plans={plans} />
      </div>
    </>
  );
}
