/**
 * 变更发现管道监控的官方页面（PRD §8.1）。只收厂商自己的定价页、帮助中心和文档，
 * 社区来源不进这里——它们只能作为线索，不能作为证据。
 */
export interface Source {
  /** 快照文件名，也是报告里的标识，只用小写字母、数字和连字符。 */
  id: string;
  vendor: string;
  url: string;
  kind: "subscription" | "api";
  /** 这个页面变化时可能受影响的档位或模型 id，交给 LLM 草稿作上下文。 */
  relatedIds: string[];
  /** 整行匹配就丢掉的噪声行，例如 A/B 实验里时有时无的导航标签。 */
  ignoreLines?: RegExp[];
  /** 页面渲染顺序不稳定时设为 true，按行排序后再比较。 */
  unordered?: boolean;
}

export const sources: Source[] = [
  {
    id: "anthropic-plans",
    vendor: "Anthropic",
    url: "https://claude.com/pricing",
    kind: "subscription",
    relatedIds: ["claude-pro", "claude-max-5x", "claude-max-20x"],
    // 这个页面有 A/B 实验：顶部受众标签时有时无（例如是否出现 Developer），
    // 功能行在「Claude Code」和「Claude Code included」之间切换，<title> 的位置也随流式渲染变化
    ignoreLines: [/^(?:(?:Individual|Developer|Team & Enterprise|API)\s*)+$/, /^Claude Code(?: included)?$/],
    unordered: true,
  },
  {
    id: "anthropic-api",
    // Markdown 版本比 HTML 稳定，去噪成本最低。
    vendor: "Anthropic",
    url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    kind: "api",
    relatedIds: ["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  {
    id: "openai-plans",
    vendor: "OpenAI",
    url: "https://chatgpt.com/pricing",
    kind: "subscription",
    relatedIds: ["chatgpt-go", "chatgpt-plus", "chatgpt-pro-100", "chatgpt-pro-200"],
  },
  {
    id: "openai-api",
    vendor: "OpenAI",
    url: "https://developers.openai.com/api/docs/pricing.md",
    kind: "api",
    relatedIds: ["gpt-6-astra", "gpt-5-6-sol", "gpt-5-6-terra", "gpt-5-4-mini", "gpt-5-6-luna"],
  },
  {
    id: "google-plans",
    vendor: "Google",
    url: "https://gemini.google/subscriptions/",
    kind: "subscription",
    relatedIds: ["google-ai-pro", "google-ai-ultra-5x", "google-ai-ultra-20x"],
  },
  {
    id: "google-api",
    vendor: "Google",
    url: "https://ai.google.dev/gemini-api/docs/pricing",
    kind: "api",
    relatedIds: ["gemini-3-1-pro", "gemini-3-6-flash", "gemini-3-5-flash-lite"],
  },
  {
    id: "cursor-plans",
    vendor: "Cursor",
    url: "https://cursor.com/pricing",
    kind: "subscription",
    relatedIds: ["cursor-pro", "cursor-pro-plus", "cursor-ultra"],
  },
  {
    id: "copilot-plans",
    vendor: "GitHub",
    url: "https://github.com/features/copilot/plans",
    kind: "subscription",
    relatedIds: ["copilot-pro", "copilot-pro-plus", "copilot-max"],
  },
  {
    id: "windsurf-plans",
    vendor: "Windsurf",
    url: "https://windsurf.com/pricing",
    kind: "subscription",
    relatedIds: ["windsurf-pro", "windsurf-max"],
  },
  {
    id: "perplexity-plans",
    vendor: "Perplexity",
    url: "https://www.perplexity.ai/pro",
    kind: "subscription",
    relatedIds: ["perplexity-pro", "perplexity-max"],
  },
  {
    id: "xai-plans",
    vendor: "xAI",
    url: "https://x.ai/grok",
    kind: "subscription",
    relatedIds: ["supergrok-lite", "supergrok", "supergrok-plus", "supergrok-heavy"],
  },
  {
    id: "xai-api",
    vendor: "xAI",
    url: "https://docs.x.ai/developers/pricing",
    kind: "api",
    relatedIds: ["grok-4-6", "grok-4-3"],
  },
  {
    id: "midjourney-plans",
    vendor: "Midjourney",
    url: "https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans",
    kind: "subscription",
    relatedIds: ["midjourney-basic", "midjourney-standard", "midjourney-pro", "midjourney-mega"],
  },
  {
    id: "mistral-pricing",
    vendor: "Mistral",
    url: "https://mistral.ai/pricing/",
    kind: "api",
    relatedIds: ["mistral-vibe-pro", "mistral-medium-3-5", "mistral-large-3", "mistral-small-4"],
  },
  {
    id: "deepseek-api",
    vendor: "DeepSeek",
    url: "https://api-docs.deepseek.com/quick_start/pricing",
    kind: "api",
    relatedIds: ["deepseek-v4-pro", "deepseek-v4-1-flash"],
  },
  {
    id: "glm-coding-plan",
    vendor: "智谱",
    url: "https://docs.bigmodel.cn/cn/coding-plan/overview",
    kind: "subscription",
    relatedIds: ["glm-coding-lite", "glm-5-3", "glm-5-3-flash"],
  },
];
