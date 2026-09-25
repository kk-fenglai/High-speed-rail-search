"use client";

import { useMemo } from "react";
import type { Plan } from "@/data/types";
import { checkOverlap } from "@/lib/overlap";
import { capabilityLabel, formatUsd } from "@/lib/pricing";
import { MINE_KEY, PRIMARY_KEY, useStoredSet } from "@/lib/storage";

const name = (p: Plan) => `${p.product} ${p.plan}`;

export function MySubscriptions({ plans }: { plans: Plan[] }) {
  const [mine, setMine] = useStoredSet(MINE_KEY);
  const [primary, setPrimary] = useStoredSet(PRIMARY_KEY);

  const byVendor = useMemo(() => {
    const m = new Map<string, Plan[]>();
    for (const p of plans) m.set(p.vendor, [...(m.get(p.vendor) ?? []), p]);
    return [...m.entries()];
  }, [plans]);

  const selected = plans.filter((p) => mine.has(p.id));
  const activePrimary = new Set([...primary].filter((id) => mine.has(id)));
  const result = checkOverlap(selected, activePrimary);
  const planById = new Map(plans.map((p) => [p.id, p]));

  const toggle = (id: string) => {
    const next = new Set(mine);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setMine(next);
  };
  const togglePrimary = (id: string) => {
    const next = new Set(primary);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPrimary(next);
  };

  return (
    <>
      <h2>1. 勾选你在付费的档位</h2>
      <div className="card">
        <div className="pick-grid">
          {byVendor.map(([vendor, list]) => (
            <div key={vendor} className="vendor-group">
              <h3>{vendor}</h3>
              {list.map((p) => (
                <label key={p.id} className="pick">
                  <input type="checkbox" checked={mine.has(p.id)} onChange={() => toggle(p.id)} />
                  <span>{name(p)}</span>
                  <span className="price">{formatUsd(p.monthlyUsd)}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <>
          <h2>2. 你每月花多少</h2>
          <div className="stats">
            <div className="card">
              <div className="stat-label">每月合计</div>
              <div className="stat-value">{formatUsd(result.monthlyTotal)}</div>
              <div className="meta">{selected.length} 个订阅</div>
            </div>
            <div className="card">
              <div className="stat-label">每年合计</div>
              <div className="stat-value">{formatUsd(Math.round(result.monthlyTotal * 12))}</div>
              <div className="meta">按月付价计算</div>
            </div>
            <div className="card">
              <div className="stat-label">去掉重叠后每月可省</div>
              <div className="stat-value save">{formatUsd(result.monthlySavings)}</div>
              <div className="meta">仅按能力类别判断，不含额度差异</div>
            </div>
          </div>

          <h2>3. 能力重叠矩阵</h2>
          <p className="lead" style={{ marginBottom: 8 }}>
            同一行有两个及以上的点，说明这项能力你买了不止一次。
          </p>
          <div className="card table-scroll">
            <table className="data matrix">
              <thead>
                <tr>
                  <th>能力</th>
                  {selected.map((p) => (
                    <th key={p.id} style={{ textAlign: "center" }}>
                      {name(p)}
                    </th>
                  ))}
                  <th className="num">重复</th>
                </tr>
              </thead>
              <tbody>
                {result.matrix.map((row) => (
                  <tr key={row.capability} className={row.planIds.length > 1 ? "overlap" : undefined}>
                    <td>{capabilityLabel(row.capability)}</td>
                    {selected.map((p) => (
                      <td key={p.id} className="hit">
                        {row.planIds.includes(p.id) ? (
                          <span className="yes" aria-label="有" />
                        ) : (
                          <span className="sr-only">无</span>
                        )}
                      </td>
                    ))}
                    <td className="num">{row.planIds.length > 1 ? `${row.planIds.length} 次` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>4. 可考虑去掉</h2>
          {result.suggestions.length === 0 ? (
            <p className="notice">没有发现可以整体去掉的订阅：每个订阅都至少提供一项别的订阅没有的能力。</p>
          ) : (
            <ul className="suggest">
              {result.suggestions.map((s) => (
                <li key={s.plan.id} className="card">
                  <div className="change-head">
                    <strong>{name(s.plan)}</strong>
                    <span className="meta">每月省 {formatUsd(s.plan.monthlyUsd)}</span>
                  </div>
                  <div className="meta" style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                    它的每项能力你的其他订阅都有：
                    {s.coveredBy
                      .map(
                        (c) =>
                          `${capabilityLabel(c.capability)}（${c.planIds.map((id) => name(planById.get(id)!)).join("、")}）`,
                      )
                      .join("；")}
                    。
                  </div>
                  <button className="link-btn" style={{ marginTop: 6 }} onClick={() => togglePrimary(s.plan.id)}>
                    这是我的主力，不要建议去掉
                  </button>
                </li>
              ))}
            </ul>
          )}
          {activePrimary.size > 0 && (
            <p className="meta" style={{ marginTop: 10 }}>
              已标记为主力：{[...activePrimary].map((id) => name(planById.get(id)!)).join("、")}。{" "}
              <button className="link-btn" onClick={() => setPrimary(new Set())}>
                清除标记
              </button>
            </p>
          )}
          <p className="notice">
            这里只比较「有没有这项能力」，不比较额度多少和模型好坏。同样能写代码，两家的额度和体验可能差很多，去掉前请确认你真的不依赖它。
          </p>
        </>
      )}
    </>
  );
}
