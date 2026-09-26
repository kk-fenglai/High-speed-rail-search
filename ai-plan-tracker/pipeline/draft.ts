import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { LineDiff } from "./extract";
import type { Source } from "./sources";

/** 与 src/data/types.ts 的 ChangeType 保持一致。 */
const CHANGE_TYPES = ["downgrade", "upgrade", "rule-change", "promo-start", "promo-end", "price-change", "new-plan"] as const;

export const DraftSchema = z.object({
  isMaterial: z.boolean().describe("差异是否涉及价格、额度、档位或计费规则；纯文案、排版、导航变化为 false"),
  summary: z.string().describe("一句话中文概括页面变化"),
  changes: z.array(
    z.object({
      affectedIds: z.array(z.string()).describe("受影响的档位或模型 id，只能从提供的已知 id 中选"),
      type: z.enum(CHANGE_TYPES),
      title: z.string().describe("中文标题，中性措辞"),
      before: z.string().describe("变更前的事实，没有则为空字符串"),
      after: z.string().describe("变更后的事实"),
      note: z.string().describe("一句话解读：对用户意味着什么"),
      evidence: z.string().describe("从「新增行」里原样引用的一句原文"),
    }),
  ),
});

export type Draft = z.infer<typeof DraftSchema>;

const MAX_DIFF_LINES = 200;

const SYSTEM_PROMPT = `你在为一个中立的 AI 套餐追踪网站起草变更记录。输入是某个厂商官方页面两次抓取之间的逐行差异，以及该页面相关档位或模型的现有记录。

只根据差异里的原文下结论，不要补充页面上没有的数字或日期。页面改版、文案润色、导航或推广横幅的变化不算实质变更，此时 isMaterial 为 false、changes 为空。

类型的判定规则：价格不变而额度减少、重置周期变长、新增一层上限、模型被换成更低级别、权益被移除，记为 downgrade；价格上涨而权益不变记为 price-change；计量单位改变（例如从条数改成美元用量）无法直接比较大小，记为 rule-change；临时活动开始或结束分别记为 promo-start、promo-end。

措辞保持中性，写「额度减少」而不是「偷偷降配」。evidence 必须是新增行里的原文。你的输出只是草稿，发布前会由人工审核。`;

export function buildDraftPrompt(
  source: Source,
  diff: LineDiff,
  context: string[],
  knownRecords: unknown[],
): { system: string; user: string } {
  const clip = (lines: string[]) =>
    lines.length > MAX_DIFF_LINES
      ? [...lines.slice(0, MAX_DIFF_LINES), `…（另有 ${lines.length - MAX_DIFF_LINES} 行未显示）`]
      : lines;
  const user = [
    `厂商：${source.vendor}`,
    `页面：${source.url}`,
    `页面类型：${source.kind === "api" ? "API 按量计费" : "个人订阅套餐"}`,
    `已知 id：${source.relatedIds.join(", ")}`,
    "",
    "<existing_records>",
    JSON.stringify(knownRecords, null, 2),
    "</existing_records>",
    "",
    "<removed_lines>",
    ...clip(diff.removed),
    "</removed_lines>",
    "",
    "<added_lines>",
    ...clip(diff.added),
    "</added_lines>",
    "",
    "<added_lines_in_context>",
    "（▶ 标出的是新增行，其余是它在页面上的前后文）",
    ...context,
    "</added_lines_in_context>",
  ].join("\n");
  return { system: SYSTEM_PROMPT, user };
}

/** 丢掉草稿里不在已知 id 列表中的引用，避免 LLM 编造的 id 进入审核环节。 */
export function sanitizeDraft(draft: Draft, source: Source): Draft {
  const known = new Set(source.relatedIds);
  return {
    ...draft,
    changes: draft.changes.map((c) => ({ ...c, affectedIds: c.affectedIds.filter((id) => known.has(id)) })),
  };
}

export type DraftResult = { ok: true; draft: Draft } | { ok: false; reason: string };

/**
 * 调用 Claude 生成结构化草稿。草稿永远不会自动发布（PRD §8.2），失败时返回原因，
 * 由报告里的原始差异兜底，人工照样能审核。
 */
export async function draftChange(
  client: Anthropic,
  source: Source,
  diff: LineDiff,
  context: string[],
  knownRecords: unknown[],
): Promise<DraftResult> {
  const { system, user } = buildDraftPrompt(source, diff, context, knownRecords);
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // 被安全分类器拒绝时由服务端按拒绝类别自动换模型重试
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: betaZodOutputFormat(DraftSchema) },
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, reason: `模型拒绝：${response.stop_details?.category ?? "未知类别"}` };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, reason: "输出被截断（max_tokens）" };
    }
    if (!response.parsed_output) {
      return { ok: false, reason: "输出无法按结构解析" };
    }
    return { ok: true, draft: sanitizeDraft(response.parsed_output, source) };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, reason: "API Key 无效" };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: "触发限流，下次运行再试" };
    if (error instanceof Anthropic.APIError) return { ok: false, reason: `API 错误 ${error.status}：${error.message}` };
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
