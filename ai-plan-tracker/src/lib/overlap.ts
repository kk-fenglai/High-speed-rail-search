import type { Capability, Plan } from "../data/types";
import { CAPABILITIES } from "./pricing";

export interface OverlapRow {
  capability: Capability;
  /** 覆盖这项能力的已订阅档位 id。 */
  planIds: string[];
}

export interface RemovalSuggestion {
  plan: Plan;
  /** 这个档位的每项能力分别还由哪些保留的档位覆盖。 */
  coveredBy: { capability: Capability; planIds: string[] }[];
}

export interface OverlapResult {
  matrix: OverlapRow[];
  monthlyTotal: number;
  suggestions: RemovalSuggestion[];
  monthlySavings: number;
}

/**
 * 重叠检查（PRD P0-5）。
 *
 * 从最贵的档位开始，逐个尝试去掉：如果它的每项能力都还被剩下的档位覆盖，就建议「可考虑去掉」。
 * 贪心保证不会同时建议去掉两个互相覆盖的档位。标记为主力的档位永远不建议去掉。
 * 只比较能力类别，不比较额度大小，所以结论只能是「可考虑」。
 */
export function checkOverlap(selected: Plan[], primaryIds: ReadonlySet<string> = new Set()): OverlapResult {
  const matrix = CAPABILITIES.map(({ id }) => ({
    capability: id,
    planIds: selected.filter((p) => p.capabilities.includes(id)).map((p) => p.id),
  })).filter((row) => row.planIds.length > 0);

  let kept = [...selected];
  const removed: Plan[] = [];

  const candidates = [...selected]
    .filter((p) => !primaryIds.has(p.id))
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd || a.id.localeCompare(b.id));

  // 不变量：保留下来的档位覆盖的能力并集始终等于全部已订阅档位的能力并集。
  for (const plan of candidates) {
    const others = kept.filter((p) => p.id !== plan.id);
    const stillCovered = plan.capabilities.every((c) => others.some((o) => o.capabilities.includes(c)));
    if (stillCovered) {
      kept = others;
      removed.push(plan);
    }
  }

  // 覆盖关系按最终保留集合计算，避免指向一个同样被建议去掉的档位。
  const suggestions: RemovalSuggestion[] = removed.map((plan) => ({
    plan,
    coveredBy: plan.capabilities.map((capability) => ({
      capability,
      planIds: kept.filter((k) => k.capabilities.includes(capability)).map((k) => k.id),
    })),
  }));

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    matrix,
    monthlyTotal: round(selected.reduce((s, p) => s + p.monthlyUsd, 0)),
    suggestions,
    monthlySavings: round(suggestions.reduce((s, x) => s + x.plan.monthlyUsd, 0)),
  };
}
