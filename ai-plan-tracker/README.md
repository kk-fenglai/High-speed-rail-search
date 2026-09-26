# AI 套餐追踪

一眼看清各家 AI 订阅和 API 哪些便宜、哪些贵，追踪套餐规则变更，检查自己的订阅有没有重叠。按 PRD《AI 订阅套餐变更追踪》的 P0 范围实现。

## 页面

- `/` 价格一览，分两个视图（`/#api` 直接打开 API 视图）：
  - 订阅套餐：四个价位带（入门 ≤$20 / 进阶 $21–99 / 重度 $100–199 / 旗舰 ≥$200）、每类能力最便宜和最贵的档位、从便宜到贵的价格排行。可按能力筛选，切换月付 / 年付折合，只看官方已核对的数据。
  - API（按 token）：按混合单价（3 份输入 : 1 份输出）分成经济 / 标准 / 高级 / 旗舰四档；对数刻度的输入价—输出价图；「订阅还是 API」计算器，按每月输入输出 token 和缓存命中比例估算各模型 API 月费，并和同厂商最便宜的订阅价对比。
- `/changes/` 变更日志：每条变更分开展示事实（变更前后）和解读，附原文出处；可只看影响自己订阅的变更。
- `/mine/` 我的订阅：勾选正在付费的档位，看月度合计、能力重叠矩阵和「可考虑去掉」的建议。数据只存在浏览器 localStorage。

## 开发

```bash
npm install
npm run dev        # 本地开发
npm test           # 逻辑与数据完整性测试
npm run typecheck
npm run build      # 静态导出到 out/，可部署到任意静态托管
```

## 数据

- `src/data/plans.ts`：档位、价格、能力、额度说明、出处。
- `src/data/apiModels.ts`：API 模型的输入、缓存命中、输出单价（美元 / 百万 token，标准档）。
- `src/data/changes.ts`：变更日志，按时间倒序。
- 每条数据都带 `verification`：`official` 表示已对照厂商官方定价页核对；`secondary` 表示仅依据第三方资料，页面上显示「待核实」。订阅数据只有 Claude（Pro、Max 5x）和 GitHub Copilot 核对过官方定价页；API 数据只有 Anthropic 的 5 个模型核对过官方定价页。其余在对外发布前需要逐条复核。
- 人民币标价按 `CNY_PER_USD`（7.1）估算换算成美元。
- 测试会检查档位 id 唯一、年付价不高于月付价、变更日志只引用已存在的档位且按时间倒序。

## 变更发现管道（`pipeline/`）

每 6 小时抓取一次官方定价页，页面有变化时开 PR 交给人工审核（PRD P0-6）。

```bash
npm run watch                                  # 检查全部页面
npm run watch -- --only anthropic-api,copilot-plans
```

- `pipeline/sources.ts`：监控的官方页面。渲染顺序不稳定的页面设 `unordered: true`；A/B 实验等噪声行用 `ignoreLines` 过滤。
- 流程：抓取 → 提取正文 → 与 `pipeline/snapshots/<id>.txt` 比较 → 有差异时更新快照，并在 `pipeline/pending/` 写一份审核报告（原始差异、每处新增行的上下文、审核清单）。
- 设置 `ANTHROPIC_API_KEY` 时，报告里会附一份 Claude 生成的结构化草稿（类型、影响的档位、前后值、原文引用）。草稿永远不会自动发布。
- `pipeline/state.json` 只记录连续失败次数，不进仓库。同一页面连续 2 次失败会报警。
- 第一次运行只建立基线，不产生报告。

### GitHub Actions

- `.github/workflows/ai-plan-tracker-ci.yml`：每次推送都跑类型检查、测试和构建。
- `.github/workflows/ai-plan-tracker-watch.yml`：定时运行管道。有变化时开 `pricing-watch/updates` PR；合并 PR 就完成了人工审核。任一页面连续失败时，本次运行会被标为失败。

启用前需要在仓库设置里做两件事：

1. Settings → Actions → General → Workflow permissions：勾选「Allow GitHub Actions to create and approve pull requests」。
2. （可选）Settings → Secrets and variables → Actions：添加 `ANTHROPIC_API_KEY`，用于生成 LLM 草稿。
