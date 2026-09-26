import { describe, expect, it } from "vitest";
import { apiModels } from "../../src/data/apiModels";
import { plans } from "../../src/data/plans";
import { buildDraftPrompt, sanitizeDraft } from "../draft";
import { contextSnippets, diffLines, extractText, htmlToText, normalizeText, sha256 } from "../extract";
import { sources } from "../sources";
import { ALERT_AFTER_FAILURES, decide, renderReport, reportFileName, type SourceState } from "../watch";

const NOW = "2026-09-26T00:00:00.000Z";
const LONG = (s: string) => `${s}\n${"定价说明 ".repeat(60)}`;

describe("extract", () => {
  it("drops scripts, styles, nav and footer and keeps table cells apart", () => {
    const html = `<html><head><style>.a{}</style><script>track()</script></head><body>
      <nav>Home Pricing</nav>
      <h1>Plans</h1><table><tr><td>Pro</td><td>$20 / month</td></tr></table>
      <p>Max&nbsp;5x &amp; more</p>
      <footer>© 2026 Vendor</footer></body></html>`;
    const text = normalizeText(htmlToText(html));
    expect(text).toBe("Plans\n| Pro | $20 / month\nMax 5x & more");
  });

  it("treats markdown as text and ignores whitespace-only differences", () => {
    const a = extractText("# Pricing\n\n| Model | $5 |\n", "text/markdown");
    const b = extractText("# Pricing  \r\n\r\n|  Model  |  $5 |", "text/markdown; charset=utf-8");
    expect(a).toBe(b);
    expect(sha256(a)).toBe(sha256(b));
  });

  it("drops lines matching a source's ignore rules, e.g. A/B-tested tab labels", () => {
    const rule = { ignoreLines: sources.find((s) => s.id === "anthropic-plans")!.ignoreLines };
    const a = extractText("<p>Individual Team &amp; Enterprise API</p><p>Pro $20</p>", "text/html", rule);
    const b = extractText("<p>Individual Developer Team &amp; Enterprise API</p><p>Individual</p><p>Pro $20</p>", "text/html", rule);
    expect(a).toBe("Pro $20");
    expect(b).toBe(a);
    // 含价格的行不会被误删
    expect(extractText("<p>API $5 / MTok</p>", "text/html", rule)).toBe("API $5 / MTok");
  });

  it("compares unordered pages independent of line order", () => {
    const a = extractText("Title\nPro $20\nMax $100", "text/plain", { unordered: true });
    const b = extractText("Pro $20\nMax $100\nTitle", "text/plain", { unordered: true });
    expect(a).toBe(b);
    const c = extractText("Pro $25\nMax $100\nTitle", "text/plain", { unordered: true });
    expect(diffLines(a, c)).toEqual({ added: ["Pro $25"], removed: ["Pro $20"] });
  });

  it("decodes numeric entities", () => {
    expect(htmlToText("&#36;20 &#x2014; Pro")).toBe("$20 — Pro");
  });

  it("reports added and removed lines, keeping unchanged lines out", () => {
    const d = diffLines("Pro\n$20\nMax\n$100", "Pro\n$25\nMax\n$100\nUltra");
    expect(d.removed).toEqual(["$20"]);
    expect(d.added).toEqual(["$25", "Ultra"]);
  });

  it("shows each changed line with its surrounding lines", () => {
    const page = "Free\n$0\nPro\n$10 per month\nPro+\n$39 per month";
    expect(contextSnippets(page, ["$10 per month"], 1)).toEqual(["  Pro\n▶ $10 per month\n  Pro+"]);
    // 重复出现的行依次匹配到不同位置
    expect(contextSnippets("A\nx\nB\nx", ["x", "x"], 1)).toEqual(["  A\n▶ x\n  B", "  B\n▶ x"]);
    expect(contextSnippets(page, ["不存在"], 1)).toEqual([]);
  });

  it("handles empty sides", () => {
    expect(diffLines("", "a\nb")).toEqual({ added: ["a", "b"], removed: [] });
    expect(diffLines("a", "")).toEqual({ added: [], removed: ["a"] });
  });
});

describe("decide", () => {
  const ok = (text: string) => ({ ok: true as const, text, display: text });
  const fail = { ok: false as const, error: "HTTP 503" };
  const healthy: SourceState = { lastCheckedAt: "2026-09-25T00:00:00.000Z", consecutiveFailures: 0 };

  it("creates a baseline when there is no snapshot yet", () => {
    expect(decide(undefined, undefined, ok(LONG("v1")), NOW).kind).toBe("baseline");
  });

  it("reports unchanged when the snapshot matches and resets failures", () => {
    const text = LONG("v1");
    const d = decide({ ...healthy, consecutiveFailures: 1, lastError: "x" }, text, ok(text), NOW);
    expect(d.kind).toBe("unchanged");
    expect(d.state).toEqual({ lastCheckedAt: NOW, consecutiveFailures: 0 });
  });

  it("reports the line diff and both hashes when the page changed", () => {
    const d = decide(healthy, LONG("Pro $20"), ok(LONG("Pro $25")), NOW);
    expect(d.kind).toBe("changed");
    if (d.kind === "changed") {
      expect(d.diff).toEqual({ added: ["Pro $25"], removed: ["Pro $20"] });
      expect(d.prevHash).toBe(sha256(LONG("Pro $20")));
      expect(d.nextHash).toBe(sha256(LONG("Pro $25")));
    }
  });

  it("alerts after consecutive failures, including pages that never succeeded", () => {
    const first = decide(undefined, undefined, fail, NOW);
    expect(first.kind === "failed" && first.alert).toBe(false);
    const second = decide(first.state, undefined, fail, NOW);
    expect(second.kind === "failed" && second.alert).toBe(true);
    expect(second.state.consecutiveFailures).toBe(ALERT_AFTER_FAILURES);
    expect(second.state.lastError).toBe("HTTP 503");
    // 之后第一次成功是基线，失败计数清零
    const recovered = decide(second.state, undefined, ok(LONG("v1")), NOW);
    expect(recovered.kind).toBe("baseline");
    expect(recovered.state.consecutiveFailures).toBe(0);
  });

  it("names reports by the new content hash so reruns overwrite the same file", () => {
    const source = sources[0];
    expect(reportFileName(source, "abcdef1234567890")).toBe(`${source.id}-abcdef123456.md`);
  });
});

describe("report and draft", () => {
  const source = sources.find((s) => s.id === "anthropic-api")!;
  const hashes = { prevHash: "a".repeat(64), nextHash: "b".repeat(64), checkedAt: NOW };
  const diff = { added: ["| Claude Sonnet 5 | $3 / MTok |"], removed: ["| Claude Sonnet 5 | $2 / MTok |"] };

  it("renders a review report with the raw diff and a checklist", () => {
    const md = renderReport(source, hashes, diff, ["  Pro\n▶ | Claude Sonnet 5 | $3 / MTok |"]);
    expect(md).toContain("没有配置 ANTHROPIC_API_KEY");
    expect(md).toContain("$3 / MTok");
    expect(md).toContain("- [ ] 打开页面核对原文");
    expect(md).toContain("▶ | Claude Sonnet 5 | $3 / MTok |");
  });

  it("renders a successful draft", () => {
    const md = renderReport(source, hashes, diff, [], {
      ok: true,
      draft: {
        isMaterial: true,
        summary: "Sonnet 5 涨价",
        changes: [
          {
            affectedIds: ["claude-sonnet-5"],
            type: "price-change",
            title: "Claude Sonnet 5 输入价上调",
            before: "$2",
            after: "$3",
            note: "输入成本上升 50%",
            evidence: "| Claude Sonnet 5 | $3 / MTok |",
          },
        ],
      },
    });
    expect(md).toContain("### Claude Sonnet 5 输入价上调");
    expect(md).toContain("- 影响：claude-sonnet-5");
  });

  it("puts the diff and known records into the prompt", () => {
    const { system, user } = buildDraftPrompt(source, diff, ["▶ ctx-line"], [{ id: "claude-sonnet-5" }]);
    expect(system).toContain("人工审核");
    expect(user).toContain("<added_lines>\n| Claude Sonnet 5 | $3 / MTok |");
    expect(user).toContain('"id": "claude-sonnet-5"');
    expect(user).toContain("▶ ctx-line");
  });

  it("drops ids the model made up", () => {
    const cleaned = sanitizeDraft(
      {
        isMaterial: true,
        summary: "",
        changes: [
          { affectedIds: ["claude-sonnet-5", "claude-opus-9"], type: "upgrade", title: "", before: "", after: "", note: "", evidence: "" },
        ],
      },
      source,
    );
    expect(cleaned.changes[0].affectedIds).toEqual(["claude-sonnet-5"]);
  });
});

describe("sources", () => {
  it("have unique ids and only reference known plans or models", () => {
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set([...plans.map((p) => p.id), ...apiModels.map((m) => m.id)]);
    for (const s of sources) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.url).toMatch(/^https:\/\//);
      for (const id of s.relatedIds) expect(known.has(id), `${s.id} -> ${id}`).toBe(true);
    }
  });

  it("cover every vendor that has a plan or model", () => {
    const watched = new Set(sources.map((s) => s.vendor));
    const vendors = new Set([...plans.map((p) => p.vendor), ...apiModels.map((m) => m.vendor)]);
    const missing = [...vendors].filter((v) => !watched.has(v));
    // 月之暗面和阿里云的官方页面还没确认可抓取的地址，暂时靠人工巡检
    expect(missing.sort()).toEqual(["月之暗面", "阿里云"].sort());
  });
});
