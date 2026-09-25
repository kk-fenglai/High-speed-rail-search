import { describe, expect, it } from "vitest";
import type { ApiModel } from "../../data/types";
import { apiModels } from "../../data/apiModels";
import { plans } from "../../data/plans";
import {
  apiTierOf,
  blendedPrice,
  cheapestPlanOfVendor,
  formatPer1M,
  monthlyApiCost,
  sortByBlended,
} from "../api";

const mk = (id: string, inputPer1M: number, outputPer1M: number, cachedInputPer1M?: number): ApiModel => ({
  id,
  vendor: "V",
  model: id,
  inputPer1M,
  outputPer1M,
  cachedInputPer1M,
  verification: "official",
  sourceUrl: "https://example.com",
  checkedAt: "2026-09-25",
});

describe("api pricing", () => {
  it("weights input 3:1 against output for the blended price", () => {
    expect(blendedPrice(mk("a", 2, 10))).toBe(4);
    expect(blendedPrice(mk("b", 10, 50))).toBe(20);
  });

  it("puts blended prices in the right tier at the boundaries", () => {
    expect(apiTierOf(0.26).label).toBe("经济");
    expect(apiTierOf(1).label).toBe("经济");
    expect(apiTierOf(4).label).toBe("标准");
    expect(apiTierOf(5).label).toBe("标准");
    expect(apiTierOf(8).label).toBe("高级");
    expect(apiTierOf(15).label).toBe("高级");
    expect(apiTierOf(20).label).toBe("旗舰");
  });

  it("sorts cheapest blended first", () => {
    const list = [mk("x", 10, 50), mk("y", 0.1, 0.4), mk("z", 2, 10)];
    expect(sortByBlended(list).map((m) => m.id)).toEqual(["y", "z", "x"]);
  });

  it("computes monthly cost with and without cache hits", () => {
    const m = mk("m", 2, 10, 0.2);
    expect(monthlyApiCost(m, { inputM: 10, outputM: 2, cacheHitRatio: 0 })).toBe(40);
    // 一半输入命中缓存：5×2 + 5×0.2 + 2×10 = 31
    expect(monthlyApiCost(m, { inputM: 10, outputM: 2, cacheHitRatio: 0.5 })).toBe(31);
    // 没有缓存价的模型，缓存部分按普通输入价
    expect(monthlyApiCost(mk("n", 2, 10), { inputM: 10, outputM: 2, cacheHitRatio: 0.5 })).toBe(40);
    // 比例越界时被夹在 0–1
    expect(monthlyApiCost(m, { inputM: 10, outputM: 0, cacheHitRatio: 2 })).toBe(2);
  });

  it("formats small per-token prices without collapsing to $0", () => {
    expect(formatPer1M(50)).toBe("$50");
    expect(formatPer1M(12.5)).toBe("$12.5");
    expect(formatPer1M(2.5)).toBe("$2.5");
    expect(formatPer1M(1.25)).toBe("$1.25");
    expect(formatPer1M(0.66)).toBe("$0.66");
    expect(formatPer1M(0.045)).toBe("$0.045");
    expect(formatPer1M(0.003)).toBe("$0.003");
  });

  it("finds the cheapest subscription of a vendor", () => {
    expect(cheapestPlanOfVendor(plans, "Anthropic")?.id).toBe("claude-pro");
    expect(cheapestPlanOfVendor(plans, "OpenAI")?.id).toBe("chatgpt-go");
    expect(cheapestPlanOfVendor(plans, "DeepSeek")).toBeUndefined();
  });
});

describe("api data integrity", () => {
  it("has unique ids, positive prices and cache price below input price", () => {
    const ids = apiModels.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of apiModels) {
      expect(m.inputPer1M).toBeGreaterThan(0);
      expect(m.outputPer1M).toBeGreaterThanOrEqual(m.inputPer1M);
      if (m.cachedInputPer1M !== undefined) expect(m.cachedInputPer1M).toBeLessThan(m.inputPer1M);
      expect(m.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("marks only Anthropic prices as officially verified", () => {
    for (const m of apiModels) {
      expect(m.verification === "official").toBe(m.vendor === "Anthropic");
    }
  });
});
