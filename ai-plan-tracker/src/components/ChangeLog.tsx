"use client";

import { useMemo, useState } from "react";
import type { Change, ChangeType, Plan } from "@/data/types";
import { MINE_KEY, useStoredSet } from "@/lib/storage";
import { VerifyBadge } from "./VerifyBadge";

/** 类型用状态色 + 图标 + 文字一起表达，颜色从不单独承载含义。 */
const TYPES: Record<ChangeType, { label: string; icon: string; color: string }> = {
  downgrade: { label: "降配", icon: "▼", color: "#d03b3b" },
  "price-change": { label: "改价", icon: "$", color: "#ec835a" },
  "promo-end": { label: "活动结束", icon: "■", color: "#fab219" },
  "rule-change": { label: "规则改变", icon: "↻", color: "#898781" },
  "promo-start": { label: "活动开始", icon: "+", color: "#898781" },
  "new-plan": { label: "新档位", icon: "+", color: "#898781" },
  upgrade: { label: "升配", icon: "▲", color: "#0ca30c" },
};

export function ChangeLog({ changes, plans }: { changes: Change[]; plans: Plan[] }) {
  const [mine, , loaded] = useStoredSet(MINE_KEY);
  const [vendor, setVendor] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);

  const vendors = useMemo(() => [...new Set(changes.map((c) => c.vendor))], [changes]);
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const affectsMe = (c: Change) => c.planIds.some((id) => mine.has(id));

  const shown = changes.filter(
    (c) => (vendor === "all" || c.vendor === vendor) && (!onlyMine || affectsMe(c)),
  );

  return (
    <>
      <div className="filters">
        <div className="seg" role="group" aria-label="厂商">
          <button className="chip" aria-pressed={vendor === "all"} onClick={() => setVendor("all")}>
            全部厂商
          </button>
          {vendors.map((v) => (
            <button key={v} className="chip" aria-pressed={vendor === v} onClick={() => setVendor(v)}>
              {v}
            </button>
          ))}
        </div>
        <button
          className="chip"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine((s) => !s)}
          disabled={loaded && mine.size === 0}
          title={mine.size === 0 ? "先在「我的订阅」里勾选你的档位" : undefined}
        >
          只看影响我的
        </button>
      </div>

      <ol className="timeline">
        {shown.map((c) => {
          const t = TYPES[c.type];
          const affected = c.planIds.map((id) => planById.get(id)).filter(Boolean) as Plan[];
          return (
            <li key={c.id} className="card">
              <div className="change-head">
                <span className="change-date">{c.date}</span>
                <span className="type">
                  <span className="dot" style={{ background: t.color }} aria-hidden />
                  <span aria-hidden>{t.icon}</span>
                  {t.label}
                </span>
                <span className="meta">{c.vendor}</span>
                {affectsMe(c) && <span className="mine-flag">影响你的订阅</span>}
              </div>
              <h2 className="change-title" style={{ margin: "0 0 8px" }}>
                {c.title}
              </h2>
              {(c.before || c.after) && (
                <dl className="diff">
                  {c.before && (
                    <>
                      <dt>变更前</dt>
                      <dd>{c.before}</dd>
                    </>
                  )}
                  {c.after && (
                    <>
                      <dt>变更后</dt>
                      <dd>{c.after}</dd>
                    </>
                  )}
                </dl>
              )}
              <p className="note">解读：{c.note}</p>
              <div className="meta">
                影响档位：{affected.map((p) => `${p.product} ${p.plan}`).join("、")} ·{" "}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                  出处
                </a>{" "}
                · <VerifyBadge v={c.verification} />
              </div>
            </li>
          );
        })}
      </ol>
      {shown.length === 0 && <p className="meta">没有符合条件的变更。</p>}
    </>
  );
}
