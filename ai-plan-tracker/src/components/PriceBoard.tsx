"use client";

import { useMemo, useState } from "react";
import type { Capability, Plan } from "@/data/types";
import {
  CAPABILITIES,
  TIERS,
  type Billing,
  capabilityLabel,
  effectivePrice,
  extremesByCapability,
  formatUsd,
  sortByPrice,
  tierOf,
} from "@/lib/pricing";
import { VerifyBadge } from "./VerifyBadge";

const planName = (p: Plan) => `${p.product} ${p.plan}`;

/** 坐标轴上限取整到一个好读的数。 */
function niceMax(max: number): { top: number; step: number } {
  for (const top of [50, 100, 150, 200, 300, 400, 500]) {
    if (max <= top) return { top, step: top <= 150 ? 25 : top <= 300 ? 50 : 100 };
  }
  return { top: Math.ceil(max / 100) * 100, step: 100 };
}

export function PriceBoard({ plans, cnyRate }: { plans: Plan[]; cnyRate: number }) {
  const [cap, setCap] = useState<Capability | "all">("all");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<{ plan: Plan; x: number; y: number } | null>(null);

  const pool = useMemo(
    () => plans.filter((p) => !verifiedOnly || p.verification === "official"),
    [plans, verifiedOnly],
  );
  const visible = useMemo(
    () => sortByPrice(cap === "all" ? pool : pool.filter((p) => p.capabilities.includes(cap)), billing),
    [pool, cap, billing],
  );
  const extremes = useMemo(() => extremesByCapability(pool, billing), [pool, billing]);

  const prices = visible.map((p) => effectivePrice(p, billing));
  const { top, step } = niceMax(prices.length ? Math.max(...prices) : 50);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  // 条形最多占轨道 88%，给末端的数值标签留位置。
  const pct = (v: number) => (v / top) * 88;

  const cheapest = visible[0];
  const priciest = visible[visible.length - 1];

  return (
    <>
      <div className="filters" role="group" aria-label="筛选">
        <div className="seg" role="group" aria-label="能力">
          <button className="chip" aria-pressed={cap === "all"} onClick={() => setCap("all")}>
            全部
          </button>
          {CAPABILITIES.map((c) => (
            <button key={c.id} className="chip" aria-pressed={cap === c.id} onClick={() => setCap(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="计费方式">
          <button className="chip" aria-pressed={billing === "monthly"} onClick={() => setBilling("monthly")}>
            月付
          </button>
          <button className="chip" aria-pressed={billing === "annual"} onClick={() => setBilling("annual")}>
            年付折合每月
          </button>
        </div>
        <button className="chip" aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)}>
          只看官方已核对
        </button>
      </div>

      {visible.length > 0 && (
        <p className="lead" style={{ marginBottom: 16 }}>
          {cap === "all" ? "全部" : `含「${capabilityLabel(cap)}」的`} {visible.length} 个付费档位中，最便宜的是{" "}
          <strong>
            {planName(cheapest)} {formatUsd(effectivePrice(cheapest, billing))}
          </strong>
          ，最贵的是{" "}
          <strong>
            {planName(priciest)} {formatUsd(effectivePrice(priciest, billing))}
          </strong>
          ，相差 {Math.round(effectivePrice(priciest, billing) / effectivePrice(cheapest, billing))} 倍。
        </p>
      )}

      <section aria-labelledby="tiers-h">
        <h2 id="tiers-h" className="sr-only">
          价位带
        </h2>
        <div className="tiers">
          {TIERS.map((t) => {
            const inTier = visible.filter((p) => tierOf(effectivePrice(p, billing)).id === t.id);
            return (
              <div key={t.id} className="card">
                <div className="tier-head">
                  <span className="tier-name">
                    <span className="swatch" style={{ background: `var(--tier-${t.id})` }} aria-hidden />
                    {t.label}
                  </span>
                  <span className="tier-range">{t.range}/月</span>
                </div>
                <div className="tier-count">{inTier.length} 个档位</div>
                <ul className="tier-list">
                  {inTier.map((p) => (
                    <li key={p.id}>
                      <span className="name" title={planName(p)}>
                        {planName(p)}
                      </span>
                      <span className="price">{formatUsd(effectivePrice(p, billing))}</span>
                    </li>
                  ))}
                  {inTier.length === 0 && <li className="name">—</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <h2>按能力看：最便宜和最贵</h2>
      <div className="card table-scroll">
        <table className="extremes">
          <thead>
            <tr>
              <th>想要的能力</th>
              <th>最便宜</th>
              <th>最贵</th>
              <th>价差</th>
            </tr>
          </thead>
          <tbody>
            {extremes
              .filter((e) => e.count > 0)
              .map((e) => {
                const lo = effectivePrice(e.cheapest[0], billing);
                const hi = effectivePrice(e.priciest[0], billing);
                return (
                  <tr key={e.capability}>
                    <td>
                      <button className="link-btn" onClick={() => setCap(e.capability)}>
                        {capabilityLabel(e.capability)}
                      </button>
                      <div className="sub" style={{ fontSize: 12.5 }}>
                        {e.count} 个档位
                      </div>
                    </td>
                    <td>
                      <span className="p">{formatUsd(lo)}</span>{" "}
                      <span className="sub">{e.cheapest.map(planName).join("、")}</span>
                    </td>
                    <td>
                      <span className="p">{formatUsd(hi)}</span>{" "}
                      <span className="sub">{e.priciest.map(planName).join("、")}</span>
                    </td>
                    <td className="p">{Math.round(hi / lo)}×</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <h2>价格排行（从便宜到贵）</h2>
      <div className="legend" aria-label="图例">
        {TIERS.map((t) => (
          <span key={t.id}>
            <span className="swatch" style={{ background: `var(--tier-${t.id})` }} aria-hidden />
            {t.label} {t.range}
          </span>
        ))}
        <button className="link-btn" onClick={() => setShowTable((s) => !s)} style={{ marginLeft: "auto" }}>
          {showTable ? "显示图表" : "显示表格"}
        </button>
      </div>

      {showTable ? (
        <div className="card table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>厂商</th>
                <th>档位</th>
                <th className="num">{billing === "annual" ? "年付折合/月" : "月付"}</th>
                <th>价位带</th>
                <th>能力</th>
                <th>额度说明</th>
                <th>核实</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>{p.vendor}</td>
                  <td>
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                      {planName(p)}
                    </a>
                  </td>
                  <td className="num">
                    {formatUsd(effectivePrice(p, billing))}
                    {p.originalPrice && <div className="meta">{p.originalPrice}</div>}
                  </td>
                  <td>{tierOf(effectivePrice(p, billing)).label}</td>
                  <td>{p.capabilities.map(capabilityLabel).join("、")}</td>
                  <td>{p.usageNote}</td>
                  <td>
                    <VerifyBadge v={p.verification} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card rank" style={{ ["--label-w" as string]: "clamp(120px, 40%, 230px)" }}>
          <div className="rank-axis" aria-hidden>
            <span />
            <div className="ticks">
              {ticks.map((t) => (
                <span key={t} style={{ left: `${pct(t)}%` }}>
                  ${t}
                </span>
              ))}
            </div>
          </div>
          <div role="list" onMouseLeave={() => setHover(null)}>
            {visible.map((p) => {
              const price = effectivePrice(p, billing);
              const tier = tierOf(price);
              return (
                <div
                  key={p.id}
                  role="listitem"
                  tabIndex={0}
                  className="rank-row"
                  aria-label={`${planName(p)}，每月 ${formatUsd(price)}，${tier.label}档`}
                  onMouseMove={(e) => setHover({ plan: p, x: e.clientX, y: e.clientY })}
                  onFocus={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setHover({ plan: p, x: r.left + r.width / 2, y: r.bottom });
                  }}
                  onBlur={() => setHover(null)}
                >
                  <div className="rank-label" title={planName(p)}>
                    {planName(p)}
                  </div>
                  <div
                    className="rank-track"
                    style={{ ["--tick-step" as string]: `${pct(step)}%` }}
                  >
                    <div
                      className="rank-bar"
                      style={{ width: `${pct(price)}%`, background: `var(--tier-${tier.id})` }}
                    />
                    <span className="rank-value" style={{ left: `${pct(price)}%` }}>
                      {formatUsd(price)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {visible.length === 0 && <p className="meta">没有符合条件的档位。</p>}
        </div>
      )}

      {hover && (
        <div
          className="tooltip"
          role="tooltip"
          style={{
            left: Math.min(hover.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 316),
            top: hover.y + 14,
          }}
        >
          <div className="t">
            {hover.plan.vendor} · {planName(hover.plan)}
          </div>
          <div className="row">
            月付 {formatUsd(hover.plan.monthlyUsd)}
            {hover.plan.annualMonthlyUsd !== undefined && ` · 年付折合 ${formatUsd(hover.plan.annualMonthlyUsd)}/月`}
          </div>
          {hover.plan.originalPrice && <div className="row">原价 {hover.plan.originalPrice}</div>}
          <div className="row">{hover.plan.usageNote}</div>
          <div className="row">能力：{hover.plan.capabilities.map(capabilityLabel).join("、")}</div>
          <div className="row" style={{ marginTop: 4 }}>
            <VerifyBadge v={hover.plan.verification} /> 核对于 {hover.plan.checkedAt}
          </div>
        </div>
      )}

      <p className="notice">
        价格为美国地区标价、不含税。人民币标价按 1 USD ≈ {cnyRate} CNY 估算。免费档、团队档和企业档不在比较范围内。
        「年付折合每月」对没有年付选项的档位显示月付价格。
      </p>
    </>
  );
}
