/**
 * 变更发现管道（PRD P0-6）：抓取官方页面 → 提取正文 → 与上次快照比较 → 有差异时存档并写审核报告。
 *
 * 用法：npm run watch [-- --only anthropic-api,copilot-plans]
 * 设置 ANTHROPIC_API_KEY 时会为每个有差异的页面生成 LLM 草稿；没有 Key 也能运行，报告里只有原始差异。
 * 在 GitHub Actions 中运行时，会把 changed / alert 写入 $GITHUB_OUTPUT，供工作流决定是否开 PR、是否报警。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { apiModels } from "../src/data/apiModels";
import { plans } from "../src/data/plans";
import { type DraftResult, draftChange } from "./draft";
import { type LineDiff, contextSnippets, diffLines, extractText, sha256 } from "./extract";
import { type Source, sources } from "./sources";

const here = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(here, "snapshots");
const PENDING_DIR = path.join(here, "pending");
const STATE_FILE = path.join(here, "state.json");

/** 连续失败到这个次数就报警（PRD P0-5 / P0-6）。 */
export const ALERT_AFTER_FAILURES = 2;
const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "ai-plan-tracker/0.1 (+https://github.com/kk-fenglai/High-speed-rail-search; pricing change monitor)";

/**
 * 跨次运行需要记住的只有失败计数。快照文件本身是「上次内容」的唯一来源，
 * 这样 state.json 可以放在 Actions 缓存里、不进仓库，没有变化的运行就不会产生提交。
 */
export interface SourceState {
  lastCheckedAt: string;
  consecutiveFailures: number;
  lastError?: string;
}

/** text 是用来比较和存档的规范化文本；display 保留页面原始行序，只用来给变化行找上下文。 */
export type FetchOutcome = { ok: true; text: string; display: string } | { ok: false; error: string };

export type Decision =
  | { kind: "baseline"; state: SourceState }
  | { kind: "unchanged"; state: SourceState }
  | { kind: "changed"; state: SourceState; diff: LineDiff; prevHash: string; nextHash: string }
  | { kind: "failed"; state: SourceState; alert: boolean };

/** 纯函数：根据上次状态、上次快照和本次抓取结果，决定这个页面这次该怎么处理。 */
export function decide(
  prev: SourceState | undefined,
  prevText: string | undefined,
  outcome: FetchOutcome,
  now: string,
): Decision {
  if (!outcome.ok) {
    // 从未成功抓取过的页面也累计失败次数，否则它永远不会报警
    const failures = (prev?.consecutiveFailures ?? 0) + 1;
    return {
      kind: "failed",
      state: { lastCheckedAt: now, consecutiveFailures: failures, lastError: outcome.error },
      alert: failures >= ALERT_AFTER_FAILURES,
    };
  }

  const state: SourceState = { lastCheckedAt: now, consecutiveFailures: 0 };
  if (prevText === undefined) return { kind: "baseline", state };
  const prevHash = sha256(prevText);
  const nextHash = sha256(outcome.text);
  if (prevHash === nextHash) return { kind: "unchanged", state };
  return { kind: "changed", state, diff: diffLines(prevText, outcome.text), prevHash, nextHash };
}

/** 报告按新内容的哈希命名：同一处变化没审核前，后续运行只会重写同一个文件。 */
export const reportFileName = (source: Source, nextHash: string) => `${source.id}-${nextHash.slice(0, 12)}.md`;

export function renderReport(
  source: Source,
  hashes: { prevHash: string; nextHash: string; checkedAt: string },
  diff: LineDiff,
  context: string[],
  draft?: DraftResult,
): string {
  const block = (lines: string[]) => (lines.length ? lines.slice(0, 200).join("\n") : "（无）");
  const out = [
    `# ${source.vendor} · ${source.id}`,
    "",
    `- 页面：${source.url}`,
    `- 发现时间：${hashes.checkedAt}`,
    `- 快照哈希：\`${hashes.prevHash.slice(0, 12)}\` → \`${hashes.nextHash.slice(0, 12)}\``,
    `- 差异：+${diff.added.length} 行 / -${diff.removed.length} 行`,
    "",
    "## LLM 草稿（仅供参考，必须人工核对原文）",
    "",
  ];
  if (!draft) {
    out.push("未生成：没有配置 ANTHROPIC_API_KEY。");
  } else if (!draft.ok) {
    out.push(`生成失败：${draft.reason}`);
  } else if (!draft.draft.isMaterial) {
    out.push(`判断为非实质变化：${draft.draft.summary}`);
  } else {
    out.push(draft.draft.summary, "");
    for (const c of draft.draft.changes) {
      out.push(
        `### ${c.title}`,
        "",
        `- 类型：${c.type}`,
        `- 影响：${c.affectedIds.join(", ") || "（未能匹配到已知 id）"}`,
        `- 变更前：${c.before || "—"}`,
        `- 变更后：${c.after}`,
        `- 解读：${c.note}`,
        `- 原文：「${c.evidence}」`,
        "",
      );
    }
  }
  out.push(
    "",
    "## 审核清单",
    "",
    "- [ ] 打开页面核对原文，确认不是 A/B 实验或地区差异",
    "- [ ] 更新 `src/data/plans.ts` / `src/data/apiModels.ts` 中受影响的记录",
    "- [ ] 在 `src/data/changes.ts` 顶部新增一条变更（事实与解读分开写）",
    "- [ ] 如果是噪声，考虑在 `pipeline/extract.ts` 里加去噪规则",
    "",
    "## 新增行的上下文",
    "",
    "```",
    context.length ? context.join("\n\n") : "（无）",
    "```",
    "",
    "## 原始差异",
    "",
    "<details><summary>删除的行</summary>",
    "",
    "```",
    block(diff.removed),
    "```",
    "",
    "</details>",
    "",
    "<details open><summary>新增的行</summary>",
    "",
    "```",
    block(diff.added),
    "```",
    "",
    "</details>",
    "",
  );
  return out.join("\n");
}

async function fetchSource(source: Source): Promise<FetchOutcome> {
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,text/markdown,text/plain;q=0.9,*/*;q=0.5" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    const display = extractText(body, contentType, { ignoreLines: source.ignoreLines });
    const text = source.unordered ? display.split("\n").sort().join("\n") : display;
    // 被反爬挑战页替换时正文会非常短，当作失败而不是「页面变了」
    if (text.length < 200) return { ok: false, error: `正文过短（${text.length} 字符），可能被拦截` };
    return { ok: true, text, display };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function setOutput(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ??
    (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined);
  const only = onlyArg ? new Set(onlyArg.split(",")) : undefined;
  const selected = sources.filter((s) => !only || only.has(s.id));

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  mkdirSync(PENDING_DIR, { recursive: true });
  const state = readJson<Record<string, SourceState>>(STATE_FILE, {});
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : undefined;
  const now = new Date().toISOString();
  const records = [...plans, ...apiModels] as { id: string }[];

  let changed = 0;
  const alerts: string[] = [];

  for (const source of selected) {
    const snapshotFile = path.join(SNAPSHOT_DIR, `${source.id}.txt`);
    // 快照文件末尾写了换行，读回时去掉，否则差异里会多出一个空行
    const prevText = existsSync(snapshotFile) ? readFileSync(snapshotFile, "utf8").replace(/\n$/, "") : undefined;
    const prev = state[source.id];
    const outcome = await fetchSource(source);
    const decision = decide(prev, prevText, outcome, now);

    switch (decision.kind) {
      case "failed":
        state[source.id] = decision.state;
        console.log(`✗ ${source.id}: ${decision.state.lastError}`);
        if (decision.alert) alerts.push(`${source.id}（连续 ${decision.state.consecutiveFailures} 次失败）`);
        break;
      case "baseline":
        state[source.id] = decision.state;
        if (outcome.ok) writeFileSync(snapshotFile, outcome.text + "\n");
        console.log(`◎ ${source.id}: 建立基线`);
        changed++;
        break;
      case "unchanged":
        state[source.id] = decision.state;
        console.log(`= ${source.id}: 无变化`);
        break;
      case "changed": {
        const related = records.filter((r) => source.relatedIds.includes(r.id));
        const context = outcome.ok ? contextSnippets(outcome.display, decision.diff.added) : [];
        const draft = client ? await draftChange(client, source, decision.diff, context, related) : undefined;
        writeFileSync(
          path.join(PENDING_DIR, reportFileName(source, decision.nextHash)),
          renderReport(source, { ...decision, checkedAt: now }, decision.diff, context, draft),
        );
        if (outcome.ok) writeFileSync(snapshotFile, outcome.text + "\n");
        state[source.id] = decision.state;
        console.log(`△ ${source.id}: +${decision.diff.added.length} / -${decision.diff.removed.length} 行，已写入审核报告`);
        changed++;
        break;
      }
    }
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  console.log(`\n共检查 ${selected.length} 个页面，${changed} 个有更新，${alerts.length} 个需要报警。`);
  if (alerts.length) console.log(`报警：${alerts.join("、")}`);
  setOutput("changed", changed > 0 ? "true" : "false");
  setOutput("alert", alerts.length > 0 ? "true" : "false");
  setOutput("alert_sources", alerts.join(", "));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
