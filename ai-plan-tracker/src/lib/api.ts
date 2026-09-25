import type { ApiModel, Plan } from "../data/types";

/**
 * 混合单价：按 3 份输入 : 1 份输出加权，业内常用来给 API 模型排一个总价。
 * 只用于排序和分档；具体花费用 monthlyApiCost 按真实用量算。
 */
export function blendedPrice(m: ApiModel): number {
  return (3 * m.inputPer1M + m.outputPer1M) / 4;
}

export interface ApiTier {
  id: 1 | 2 | 3 | 4;
  label: string;
  range: string;
  max: number;
}

export const API_TIERS: ApiTier[] = [
  { id: 1, label: "经济", range: "≤ $1", max: 1 },
  { id: 2, label: "标准", range: "$1 – $5", max: 5 },
  { id: 3, label: "高级", range: "$5 – $15", max: 15 },
  { id: 4, label: "旗舰", range: "> $15", max: Infinity },
];

export function apiTierOf(blended: number): ApiTier {
  return API_TIERS.find((t) => blended <= t.max) ?? API_TIERS[API_TIERS.length - 1];
}

export function sortByBlended(list: ApiModel[]): ApiModel[] {
  return [...list].sort((a, b) => blendedPrice(a) - blendedPrice(b) || a.model.localeCompare(b.model));
}

export interface Usage {
  /** 每月输入 token，单位：百万。 */
  inputM: number;
  /** 每月输出 token，单位：百万。 */
  outputM: number;
  /** 输入里命中缓存的比例，0–1。 */
  cacheHitRatio: number;
}

/** 按月用量估算 API 花费（美元）。没有公布缓存价的模型，缓存部分按普通输入价计。 */
export function monthlyApiCost(m: ApiModel, u: Usage): number {
  const ratio = Math.min(1, Math.max(0, u.cacheHitRatio));
  const cachedPrice = m.cachedInputPer1M ?? m.inputPer1M;
  const input = u.inputM * ((1 - ratio) * m.inputPer1M + ratio * cachedPrice);
  return Math.round((input + u.outputM * m.outputPer1M) * 100) / 100;
}

/** 同一厂商最便宜的个人订阅档位，用于「订阅还是 API」对比。 */
export function cheapestPlanOfVendor(plans: Plan[], vendor: string): Plan | undefined {
  return plans
    .filter((p) => p.vendor === vendor)
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd)[0];
}

/** 美元 / 百万 token 的显示：小于 $1 保留到有效数字，避免 $0.00。 */
export function formatPer1M(n: number): string {
  if (n >= 10) return `$${Number.isInteger(n) ? n : n.toFixed(1)}`;
  if (n >= 1) return `$${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}`;
  return `$${Number(n.toPrecision(2))}`;
}
