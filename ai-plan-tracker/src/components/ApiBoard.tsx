"use client";

import { useMemo, useState } from "react";
import type { ApiModel, Plan } from "@/data/types";
import {
  API_TIERS,
  type Usage,
  apiTierOf,
  blendedPrice,
  cheapestPlanOfVendor,
  formatPer1M,
  monthlyApiCost,
  sortByBlended,
} from "@/lib/api";
import { formatUsd } from "@/lib/pricing";
import { VerifyBadge } from "./VerifyBadge";

/**
 * API 价格跨三个数量级（$0.045 到 $50），所以横轴用对数刻度。
 * 对数轴上画条形会误导长度比较，这里用「输入点 — 输出点」的哑铃图，只比较位置。
 */
const LOG_MIN = -2; // $0.01
const LOG_MAX = 2; // $100
const TICKS = [0.01, 0.1, 1, 10, 100];
const pos = (v: number) => ((Math.log10(Math.max(v, 10 ** LOG_MIN)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;

const PRESETS: { label: string; usage: Omit<Usage, "cacheHitRatio">; hint: string }[] = [
  { label: "轻度聊天", usage: { inputM: 2, outputM: 0.5 }, hint: "每天几十轮对话" },
  { label: "日常编程", usage: { inputM: 20, outputM: 2 }, hint: "每天数小时 IDE 辅助" },
  { label: "重度 Agent", usage: { inputM: 150, outputM: 10 }, hint: "全天跑编程 Agent" },
];

export function ApiBoard({ models, plans }: { models: ApiModel[]; plans: Plan[] }) {
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<{ m: ApiModel; x: number; y: number } | null>(null);
  const [inputM, setInputM] = useState(20);
  const [outputM, setOutputM] = useState(2);
  const [cacheHitRatio, setCacheHitRatio] = useState(0.5);

  const visible = useMemo(
    () => sortByBlended(models.filter((m) => !verifiedOnly || m.verification === "official")),
    [models, verifiedOnly],
  );
  const usage: Usage = { inputM, outputM, cacheHitRatio };
  const costs = useMemo(
    () =>
      visible
        .map((m) => ({ m, cost: monthlyApiCost(m, { inputM, outputM, cacheHitRatio }) }))
        .sort((a, b) => a.cost - b.cost),
    [visible, inputM, outputM, cacheHitRatio],
  );

  const cheapest = visible[0];
  const priciest = visible[visible.length - 1];

  return (
    <>
      <div className="filters">
        <button className="chip" aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)}>
          只看官方已核对
        </button>
      </div>

      {visible.length > 0 && (
        <p className="lead" style={{ marginBottom: 16 }}>
          {visible.length} 个模型中，混合单价最便宜的是{" "}
          <strong>
            {cheapest.model} {formatPer1M(blendedPrice(cheapest))}
          </strong>
          ，最贵的是{" "}
          <strong>
            {priciest.model} {formatPer1M(blendedPrice(priciest))}
          </strong>
          （每百万 token），相差 {Math.round(blendedPrice(priciest) / blendedPrice(cheapest))} 倍。
        </p>
      )}

      <div className="tiers">
        {API_TIERS.map((t) => {
          const inTier = visible.filter((m) => apiTierOf(blendedPrice(m)).id === t.id);
          return (
            <div key={t.id} className="card">
              <div className="tier-head">
                <span className="tier-name">
                  <span className="swatch" style={{ background: `var(--tier-${t.id})` }} aria-hidden />
                  {t.label}
                </span>
                <span className="tier-range">{t.range}/百万</span>
              </div>
              <div className="tier-count">{inTier.length} 个模型</div>
              <ul className="tier-list">
                {inTier.map((m) => (
                  <li key={m.id}>
                    <span className="name" title={m.model}>
                      {m.model}
                    </span>
                    <span className="price">{formatPer1M(blendedPrice(m))}</span>
                  </li>
                ))}
                {inTier.length === 0 && <li className="name">—</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="meta" style={{ marginTop: 8 }}>
        混合单价 =（3 × 输入价 + 输出价）÷ 4，单位：美元 / 百万 token。用来给模型排一个总价；实际花费取决于你的输入输出比例，见下方计算器。
      </p>

      <h2>输入价和输出价（对数刻度，从便宜到贵）</h2>
      <div className="legend" aria-label="图例">
        <span>
          <span className="dot-key" style={{ background: "var(--series-in)" }} aria-hidden />
          输入价
        </span>
        <span>
          <span className="dot-key" style={{ background: "var(--series-out)" }} aria-hidden />
          输出价
        </span>
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
                <th>模型</th>
                <th className="num">输入</th>
                <th className="num">缓存命中</th>
                <th className="num">输出</th>
                <th className="num">混合</th>
                <th>说明</th>
                <th>核实</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id}>
                  <td>{m.vendor}</td>
                  <td>
                    <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                      {m.model}
                    </a>
                  </td>
                  <td className="num">{formatPer1M(m.inputPer1M)}</td>
                  <td className="num">{m.cachedInputPer1M !== undefined ? formatPer1M(m.cachedInputPer1M) : "—"}</td>
                  <td className="num">{formatPer1M(m.outputPer1M)}</td>
                  <td className="num">{formatPer1M(blendedPrice(m))}</td>
                  <td>{m.note ?? ""}</td>
                  <td>
                    <VerifyBadge v={m.verification} />
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
              {TICKS.map((t) => (
                <span key={t} style={{ left: `${pos(t) * 0.9 + 3}%` }}>
                  ${t}
                </span>
              ))}
            </div>
          </div>
          <div role="list" onMouseLeave={() => setHover(null)}>
            {visible.map((m) => {
              // 两端各留 3% / 7% 给点和数值标签
              const x = (v: number) => pos(v) * 0.9 + 3;
              const xin = x(m.inputPer1M);
              const xout = x(m.outputPer1M);
              return (
                <div
                  key={m.id}
                  role="listitem"
                  tabIndex={0}
                  className="rank-row"
                  aria-label={`${m.model}：输入 ${formatPer1M(m.inputPer1M)}，输出 ${formatPer1M(m.outputPer1M)}，每百万 token`}
                  onMouseMove={(e) => setHover({ m, x: e.clientX, y: e.clientY })}
                  onFocus={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setHover({ m, x: r.left + r.width / 2, y: r.bottom });
                  }}
                  onBlur={() => setHover(null)}
                >
                  <div className="rank-label" title={m.model}>
                    {m.model}
                  </div>
                  <div className="dumb-track">
                    {TICKS.map((t) => (
                      <span key={t} className="gridline" style={{ left: `${x(t)}%` }} aria-hidden />
                    ))}
                    <span className="dumb-line" style={{ left: `${xin}%`, width: `${xout - xin}%` }} aria-hidden />
                    <span className="dumb-dot" style={{ left: `${xin}%`, background: "var(--series-in)" }} />
                    <span className="dumb-dot" style={{ left: `${xout}%`, background: "var(--series-out)" }} />
                    <span className="rank-value" style={{ left: `calc(${xout}% + 6px)` }}>
                      {formatPer1M(m.outputPer1M)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
            {hover.m.vendor} · {hover.m.model}
          </div>
          <div className="row">
            输入 {formatPer1M(hover.m.inputPer1M)} · 输出 {formatPer1M(hover.m.outputPer1M)}
            {hover.m.cachedInputPer1M !== undefined && ` · 缓存命中 ${formatPer1M(hover.m.cachedInputPer1M)}`}
          </div>
          <div className="row">混合单价 {formatPer1M(blendedPrice(hover.m))}（每百万 token）</div>
          {hover.m.note && <div className="row">{hover.m.note}</div>}
          <div className="row" style={{ marginTop: 4 }}>
            <VerifyBadge v={hover.m.verification} /> 核对于 {hover.m.checkedAt}
          </div>
        </div>
      )}

      <h2>订阅还是 API？按你的用量算一算</h2>
      <div className="card">
        <div className="filters" style={{ marginTop: 0 }}>
          <div className="seg" role="group" aria-label="用量预设">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="chip"
                title={p.hint}
                aria-pressed={inputM === p.usage.inputM && outputM === p.usage.outputM}
                onClick={() => {
                  setInputM(p.usage.inputM);
                  setOutputM(p.usage.outputM);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="calc-inputs">
          <label>
            每月输入（百万 token）
            <input
              type="number"
              min={0}
              step={0.5}
              value={inputM}
              onChange={(e) => setInputM(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label>
            每月输出（百万 token）
            <input
              type="number"
              min={0}
              step={0.5}
              value={outputM}
              onChange={(e) => setOutputM(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label>
            输入命中缓存的比例
            <select value={cacheHitRatio} onChange={(e) => setCacheHitRatio(Number(e.target.value))}>
              <option value={0}>0%（不用缓存）</option>
              <option value={0.5}>50%</option>
              <option value={0.8}>80%（编程 Agent 常见）</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card table-scroll" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>模型</th>
              <th className="num">API 每月花费</th>
              <th>对比同厂商最便宜的订阅</th>
            </tr>
          </thead>
          <tbody>
            {costs.map(({ m, cost }) => {
              const plan = cheapestPlanOfVendor(plans, m.vendor);
              const diff = plan ? Math.round(Math.abs(plan.monthlyUsd - cost) * 100) / 100 : 0;
              return (
                <tr key={m.id}>
                  <td>
                    {m.model}
                    <div className="meta">{m.vendor}</div>
                  </td>
                  <td className="num">
                    <strong>{formatUsd(cost)}</strong>
                  </td>
                  <td>
                    {plan ? (
                      <>
                        {cost <= plan.monthlyUsd ? `比订阅省 ${formatUsd(diff)}` : `比订阅贵 ${formatUsd(diff)}`}
                        <div className="meta">
                          {plan.product} {plan.plan} {formatUsd(plan.monthlyUsd)}/月
                        </div>
                      </>
                    ) : (
                      <span className="meta">该厂商没有个人订阅</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="notice">
        订阅的额度不按 token 公开，这里只把 API 花费和同厂商最便宜的订阅价放在一起看：最便宜的订阅不一定包含这个模型，额度也不一定够用。订阅额度用完就要等重置，API
        则按量付费、没有上限。当前用量：每月输入 {usage.inputM} 百万、输出 {usage.outputM} 百万 token，缓存命中{" "}
        {Math.round(usage.cacheHitRatio * 100)}%。价格为标准档，不含批量折扣和长上下文加价。
      </p>
    </>
  );
}
