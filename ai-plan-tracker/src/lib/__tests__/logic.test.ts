import { describe, expect, it } from "vitest";
import type { Capability, Plan } from "../../data/types";
import { plans } from "../../data/plans";
import { changes } from "../../data/changes";
import { checkOverlap } from "../overlap";
import { changeSortKey, effectivePrice, extremesByCapability, sortByPrice, tierOf } from "../pricing";

const mk = (id: string, monthlyUsd: number, capabilities: Capability[], annualMonthlyUsd?: number): Plan => ({
  id,
  vendor: id,
  product: id,
  plan: id,
  monthlyUsd,
  annualMonthlyUsd,
  capabilities,
  usageNote: "",
  verification: "official",
  sourceUrl: "https://example.com",
  checkedAt: "2026-09-25",
});

describe("pricing", () => {
  it("puts boundary prices in the right tier", () => {
    expect(tierOf(8).label).toBe("入门");
    expect(tierOf(20).label).toBe("入门");
    expect(tierOf(30).label).toBe("进阶");
    expect(tierOf(99.99).label).toBe("进阶");
    expect(tierOf(100).label).toBe("重度");
    expect(tierOf(199.99).label).toBe("重度");
    expect(tierOf(200).label).toBe("旗舰");
    expect(tierOf(300).label).toBe("旗舰");
  });

  it("falls back to monthly price when there is no annual option", () => {
    expect(effectivePrice(mk("a", 20, ["chat"], 16), "annual")).toBe(16);
    expect(effectivePrice(mk("b", 20, ["chat"]), "annual")).toBe(20);
    expect(effectivePrice(mk("a", 20, ["chat"], 16), "monthly")).toBe(20);
  });

  it("sorts cheapest first and returns ties for extremes", () => {
    const list = [mk("x", 200, ["chat"]), mk("y", 10, ["chat"]), mk("z", 10, ["chat", "image"])];
    expect(sortByPrice(list, "monthly").map((p) => p.id)).toEqual(["y", "z", "x"]);
    const chat = extremesByCapability(list, "monthly").find((e) => e.capability === "chat")!;
    expect(chat.cheapest.map((p) => p.id)).toEqual(["y", "z"]);
    expect(chat.priciest.map((p) => p.id)).toEqual(["x"]);
    const video = extremesByCapability(list, "monthly").find((e) => e.capability === "video")!;
    expect(video.count).toBe(0);
  });
});

describe("overlap", () => {
  it("suggests dropping a plan whose capabilities are all covered elsewhere", () => {
    const big = mk("big", 20, ["chat", "search", "coding-cli"]);
    const small = mk("small", 20, ["chat", "search"]);
    const r = checkOverlap([big, small]);
    expect(r.suggestions.map((s) => s.plan.id)).toEqual(["small"]);
    expect(r.monthlySavings).toBe(20);
    expect(r.monthlyTotal).toBe(40);
  });

  it("never suggests dropping two plans that only cover each other", () => {
    const a = mk("a", 20, ["chat"]);
    const b = mk("b", 20, ["chat"]);
    const r = checkOverlap([a, b]);
    expect(r.suggestions).toHaveLength(1);
  });

  it("keeps the capability union intact across chained removals", () => {
    // A 和 B 互相覆盖，C 只覆盖 chat。先去掉最贵的 A；B 是 image 的唯一来源，必须保留；C 的 chat 由 B 覆盖，可去掉。
    const a = mk("a", 300, ["chat", "image"]);
    const b = mk("b", 100, ["chat", "image"]);
    const c = mk("c", 10, ["chat"]);
    const r = checkOverlap([a, b, c]);
    const keptCaps = new Set(
      [a, b, c].filter((p) => !r.suggestions.some((s) => s.plan.id === p.id)).flatMap((p) => p.capabilities),
    );
    expect(keptCaps).toEqual(new Set(["chat", "image"]));
    expect(r.suggestions.map((s) => s.plan.id)).toEqual(["a", "c"]);
    for (const s of r.suggestions) {
      for (const cov of s.coveredBy) {
        expect(cov.planIds.length).toBeGreaterThan(0);
        expect(cov.planIds).toEqual(["b"]);
      }
    }
  });

  it("never suggests dropping a plan marked as primary", () => {
    const pricey = mk("pricey", 200, ["chat"]);
    const cheap = mk("cheap", 20, ["chat"]);
    const r = checkOverlap([pricey, cheap], new Set(["pricey"]));
    expect(r.suggestions.map((s) => s.plan.id)).toEqual(["cheap"]);
  });

  it("returns nothing to drop when plans do not overlap", () => {
    const r = checkOverlap([mk("a", 20, ["chat"]), mk("b", 10, ["image"])]);
    expect(r.suggestions).toEqual([]);
    expect(r.matrix.map((m) => m.capability)).toEqual(["chat", "image"]);
  });
});

describe("data integrity", () => {
  it("has unique plan ids and valid prices", () => {
    const ids = plans.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of plans) {
      expect(p.monthlyUsd).toBeGreaterThan(0);
      if (p.annualMonthlyUsd !== undefined) expect(p.annualMonthlyUsd).toBeLessThanOrEqual(p.monthlyUsd);
      expect(p.capabilities.length).toBeGreaterThan(0);
      expect(p.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("only references known plans in the changelog, newest first", () => {
    const ids = new Set(plans.map((p) => p.id));
    for (const c of changes) {
      expect(c.planIds.length).toBeGreaterThan(0);
      for (const id of c.planIds) expect(ids.has(id), `${c.id} -> ${id}`).toBe(true);
      expect(c.date).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(c.sourceUrl).toMatch(/^https:\/\//);
    }
    const keys = changes.map((c) => changeSortKey(c.date));
    expect([...keys].sort().reverse()).toEqual(keys);
    expect(new Set(changes.map((c) => c.id)).size).toBe(changes.length);
  });
});
