import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  times: "×",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/**
 * 把 HTML 变成按块分行的纯文本。去掉脚本、样式、导航和页脚，这些区域的变化和定价无关，
 * 是假阳性的主要来源（PRD §8.2 去噪）。
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|noscript|svg|template|nav|footer|header)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|ul|ol|dt|dd)>/gi, "\n")
      .replace(/<(td|th)\b[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  );
}

/** 统一空白、去掉空行和明显的噪声行，保证同样的内容总得到同样的文本和哈希。 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(©|copyright\b)/i.test(line))
    .join("\n");
}

export interface CanonicalizeOptions {
  /** 整行匹配就丢掉的噪声行。 */
  ignoreLines?: RegExp[];
  /** 按行排序后再比较，用于渲染顺序不稳定的页面；代价是察觉不到「只换了位置」的行。 */
  unordered?: boolean;
}

export function extractText(body: string, contentType: string, opts: CanonicalizeOptions = {}): string {
  const isHtml = /html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(body);
  let lines = normalizeText(isHtml ? htmlToText(body) : body).split("\n");
  const ignore = opts.ignoreLines ?? [];
  if (ignore.length) lines = lines.filter((line) => !ignore.some((re) => re.test(line)));
  if (opts.unordered) lines = [...lines].sort();
  return lines.join("\n");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface LineDiff {
  added: string[];
  removed: string[];
}

const LCS_LIMIT = 4000;

/**
 * 按行比较两个版本。行数不大时用 LCS，保留重复行的增删；超过上限时退化为集合差，
 * 只会漏掉「同一行重复出现次数变化」这种对定价无意义的情况。
 */
export function diffLines(before: string, after: string): LineDiff {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];

  if (a.length > LCS_LIMIT || b.length > LCS_LIMIT) {
    const sa = new Set(a);
    const sb = new Set(b);
    return { added: b.filter((l) => !sa.has(l)), removed: a.filter((l) => !sb.has(l)) };
  }

  const m = a.length;
  const n = b.length;
  // dp[i][j] = a[i:] 与 b[j:] 的 LCS 长度，一维数组按行展开
  const dp = new Uint16Array((m + 1) * (n + 1));
  const at = (i: number, j: number) => i * (n + 1) + j;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j] ? dp[at(i + 1, j + 1)] + 1 : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      removed.push(a[i++]);
    } else {
      added.push(b[j++]);
    }
  }
  while (i < m) removed.push(a[i++]);
  while (j < n) added.push(b[j++]);
  return { added, removed };
}

/**
 * 为每个新增行截取它在页面原始顺序中的上下文（前后各 radius 行），变化行用「▶」标出。
 * 单独一行「$10 per month」看不出属于哪个档位，审核人和 LLM 都需要上下文。
 */
export function contextSnippets(orderedText: string, changedLines: string[], radius = 2, limit = 30): string[] {
  const lines = orderedText.split("\n");
  const used = new Set<number>();
  const snippets: string[] = [];
  for (const target of changedLines) {
    if (snippets.length >= limit) break;
    const idx = lines.findIndex((l, i) => l === target && !used.has(i));
    if (idx < 0) continue;
    used.add(idx);
    const from = Math.max(0, idx - radius);
    const to = Math.min(lines.length, idx + radius + 1);
    snippets.push(
      lines
        .slice(from, to)
        .map((l, k) => (from + k === idx ? `▶ ${l}` : `  ${l}`))
        .join("\n"),
    );
  }
  return snippets;
}
