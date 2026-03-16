import type { IntentType, TradeIntent } from "../types.js";

const TRADE_PATTERN =
  /(?<side>buy|sell|买入|卖出|建仓|平仓)\s+(?<quantity>\d+(?:\.\d+)?)\s*(?:shares?|股)?\s*(?:of\s+)?\$?(?<symbol>[A-Za-z.]{1,12})(?:.*?(?<orderType>limit|market|限价|市价))?(?:.*?(?:at|限价)\s*\$?(?<limit>\d+(?:\.\d+)?))?/i;

const PORTFOLIO_KEYWORDS = ["portfolio", "持仓", "仓位", "账户", "positions"];
const PORTFOLIO_MUTATION_PATTERN =
  /(?:\bi (?:hold|own|have)\b|\bmy cash\b|\bmy portfolio\b|持有|我有|我现在有|我持仓|现金|成本价|平均成本)/i;
const RISK_KEYWORDS = ["risk", "风险", "drawdown", "回撤"];
const RESEARCH_KEYWORDS = [
  "analyze",
  "analysis",
  "分析",
  "research",
  "股票",
  "估值",
  "基本面",
  "技术分析",
  "ticker",
  "stock",
];
const OPS_PATTERNS = [
  /\binstall mcp\b/i,
  /\binstall skill\b/i,
  /安装.*(?:skill|技能|mcp|clawhub|agent browser)/i,
  /(?:skill|技能|mcp|clawhub|agent browser).*(?:安装|加上|装一下)/i,
  /配置/i,
  /\bconfig\b/i,
  /\bllm\b/i,
  /\bapi key\b/i,
  /\breload\b/i,
  /\bprovider\b/i,
];

export function classifyIntent(message: string): IntentType {
  const normalized = message.toLowerCase();
  if (TRADE_PATTERN.test(message)) {
    return "trade_request";
  }
  if (OPS_PATTERNS.some((pattern) => pattern.test(message))) {
    return "ops_request";
  }
  if (PORTFOLIO_MUTATION_PATTERN.test(message) || PORTFOLIO_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "portfolio_review";
  }
  if (RESEARCH_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "investment_research";
  }
  if (RISK_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "risk_review";
  }
  return "chat";
}

export function isPortfolioMutationRequest(message: string): boolean {
  return PORTFOLIO_MUTATION_PATTERN.test(message);
}

export function isSessionResetCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === "/new" || normalized === "/reset";
}

export function normalizeResetCommand(message: string): "/new" | "/reset" {
  return message.trim().toLowerCase() === "/reset" ? "/reset" : "/new";
}

export function parseTradeIntent(message: string): TradeIntent | null {
  const match = TRADE_PATTERN.exec(message);
  if (!match?.groups) {
    return null;
  }
  const side = normalizeSide(match.groups.side);
  if (!side) {
    return null;
  }
  const quantity = Number(match.groups.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const symbol = match.groups.symbol.toUpperCase();
  const limitPrice = match.groups.limit ? Number(match.groups.limit) : null;
  const orderType = normalizeOrderType(match.groups.orderType, limitPrice);
  return {
    symbol,
    side,
    quantity,
    orderType,
    limitPrice,
    rationale: message,
  };
}

function normalizeSide(value: string): "buy" | "sell" | null {
  if (["buy", "买入", "建仓"].includes(value.toLowerCase())) {
    return "buy";
  }
  if (["sell", "卖出", "平仓"].includes(value.toLowerCase())) {
    return "sell";
  }
  return null;
}

function normalizeOrderType(value: string | undefined, limitPrice: number | null): "market" | "limit" {
  if (!value) {
    return limitPrice == null ? "market" : "limit";
  }
  const normalized = value.toLowerCase();
  return normalized === "market" || normalized === "市价" ? "market" : "limit";
}
