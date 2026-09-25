/** 八类能力，重叠检查和筛选都按这 8 类计算（PRD §5）。 */
export type Capability =
  | "chat"
  | "reasoning"
  | "coding-ide"
  | "coding-cli"
  | "research"
  | "image"
  | "video"
  | "search";

/**
 * official：已打开厂商官方定价页核对。
 * secondary：仅依据第三方页面或搜索摘要，页面上显示「待核实」。
 */
export type Verification = "official" | "secondary";

export interface Plan {
  id: string;
  vendor: string;
  product: string;
  plan: string;
  /** 月付价格，统一换算为美元。 */
  monthlyUsd: number;
  /** 年付折合每月的美元价格；没有年付选项则省略。 */
  annualMonthlyUsd?: number;
  /** 非美元标价的原始价格，用于展示，例如「¥99/月」。 */
  originalPrice?: string;
  capabilities: Capability[];
  /** 额度的一句话描述，只写厂商公开说法。 */
  usageNote: string;
  verification: Verification;
  sourceUrl: string;
  checkedAt: string;
}

export type ChangeType =
  | "downgrade"
  | "upgrade"
  | "rule-change"
  | "promo-start"
  | "promo-end"
  | "price-change"
  | "new-plan";

export interface Change {
  id: string;
  /** YYYY-MM-DD，或只知道月份时为 YYYY-MM。 */
  date: string;
  vendor: string;
  /** 受影响的档位 id，用于匹配「我的订阅」。 */
  planIds: string[];
  type: ChangeType;
  title: string;
  before?: string;
  after?: string;
  /** 编辑解读，与事实字段分开展示（PRD §9 原则 2）。 */
  note: string;
  verification: Verification;
  sourceUrl: string;
}
