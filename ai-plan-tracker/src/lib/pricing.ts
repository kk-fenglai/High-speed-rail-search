import type { Capability, Plan } from "../data/types";

export const CAPABILITIES: { id: Capability; label: string }[] = [
  { id: "chat", label: "对话" },
  { id: "reasoning", label: "推理" },
  { id: "coding-ide", label: "编程 IDE" },
  { id: "coding-cli", label: "编程 CLI / Agent" },
  { id: "research", label: "深度研究" },
  { id: "image", label: "图像生成" },
  { id: "video", label: "视频生成" },
  { id: "search", label: "联网搜索" },
];

export const capabilityLabel = (c: Capability) =>
  CAPABILITIES.find((x) => x.id === c)?.label ?? c;

export type Billing = "monthly" | "annual";

export interface Tier {
  id: 1 | 2 | 3 | 4;
  label: string;
  range: string;
  /** 价格上限（含），最后一档为 Infinity。 */
  max: number;
}

/** 四个价位带：用户一眼分清便宜和贵，就靠这一层（首页顶部）。 */
export const TIERS: Tier[] = [
  { id: 1, label: "入门", range: "≤ $20", max: 20 },
  { id: 2, label: "进阶", range: "$21 – $99", max: 99.99 },
  { id: 3, label: "重度", range: "$100 – $199", max: 199.99 },
  { id: 4, label: "旗舰", range: "≥ $200", max: Infinity },
];

/** 年付选项不存在时回落到月付价格。 */
export function effectivePrice(plan: Plan, billing: Billing): number {
  if (billing === "annual" && plan.annualMonthlyUsd !== undefined) {
    return plan.annualMonthlyUsd;
  }
  return plan.monthlyUsd;
}

export function tierOf(price: number): Tier {
  return TIERS.find((t) => price <= t.max) ?? TIERS[TIERS.length - 1];
}

export function formatUsd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function sortByPrice(list: Plan[], billing: Billing): Plan[] {
  return [...list].sort(
    (a, b) =>
      effectivePrice(a, billing) - effectivePrice(b, billing) ||
      a.vendor.localeCompare(b.vendor) ||
      a.plan.localeCompare(b.plan),
  );
}

export interface CapabilityExtremes {
  capability: Capability;
  cheapest: Plan[];
  priciest: Plan[];
  count: number;
}

/** 每类能力里最便宜和最贵的档位；并列时全部返回。 */
export function extremesByCapability(list: Plan[], billing: Billing): CapabilityExtremes[] {
  return CAPABILITIES.map(({ id }) => {
    const withCap = list.filter((p) => p.capabilities.includes(id));
    if (withCap.length === 0) return { capability: id, cheapest: [], priciest: [], count: 0 };
    const prices = withCap.map((p) => effectivePrice(p, billing));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return {
      capability: id,
      cheapest: sortByPrice(withCap.filter((p) => effectivePrice(p, billing) === min), billing),
      priciest: sortByPrice(withCap.filter((p) => effectivePrice(p, billing) === max), billing),
      count: withCap.length,
    };
  });
}

/** 只知道月份的变更（YYYY-MM）排在该月末尾。 */
export function changeSortKey(date: string): string {
  return date.length === 7 ? `${date}-31` : date;
}
