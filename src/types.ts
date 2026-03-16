export type IntentType =
  | "chat"
  | "investment_research"
  | "portfolio_review"
  | "trade_request"
  | "risk_review"
  | "ops_request";

export type SessionIntent = "research" | "portfolio" | "trade" | "ops";

export type ChannelType = "web" | "telegram";

export const ROOT_AGENT_PROFILE_ID = "orchestrator";

export type AgentProfileId = string;

export type ToolCategory =
  | "market"
  | "research"
  | "portfolio"
  | "backtest"
  | "memory"
  | "trade"
  | "config"
  | "session"
  | "ops";

export type ToolRiskLevel = "read" | "write" | "exec" | "admin";

export interface AgentProfile {
  id: AgentProfileId;
  description: string;
  allowedToolGroups: string[];
  allowedTools: string[];
  writeCapabilities: Array<"memory" | "portfolio" | "config" | "skills">;
  spawnCapabilities: AgentProfileId[];
}

export interface ToolDescriptor {
  name: string;
  group: string | null;
  category: ToolCategory;
  risk: ToolRiskLevel;
  description: string;
  source: "business" | "mcp";
}

export interface UserRequest {
  requestId: string;
  channel: ChannelType;
  userId: string;
  sessionId: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface UserResponsePayload {
  requestId: string;
  sessionId: string;
  message: string;
  blocks: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
}

export interface OrchestratorResult {
  intent: IntentType;
  response: UserResponsePayload;
}

export type ConversationRole = "system" | "user" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  timestamp: string;
}

export interface SessionTranscriptEntry {
  role: ConversationRole;
  content: string;
  timestamp: string;
}

export interface AppSessionRecord {
  sessionId: string;
  userId: string;
  channel: ChannelType;
  createdAt: string;
  updatedAt: string;
  lastIntent: IntentType | null;
  transcript: SessionTranscriptEntry[];
  lastResult: UserResponsePayload | null;
  sessionSummary: string | null;
  sessionSummaryUpdatedAt: string | null;
  lastUsage: UsageSnapshot | null;
  cumulativeUsage: UsageAggregate;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  marketPrice: number | null;
  marketValue: number | null;
  currency: string;
}

export interface PortfolioSnapshot {
  accountId: string;
  mode: string;
  cash: number;
  equity: number | null;
  buyingPower: number | null;
  positions: Position[];
  openOrders: Array<Record<string, unknown>>;
  updatedAt: string;
}

export interface SpecialistResult {
  role: string;
  sessionId: string;
  message: string;
  toolCalls: ToolCallRecord[];
  usage?: UsageAggregate;
  requestId?: string;
  task?: string;
  createdAt?: string;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
}

export interface MemorySearchResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  citation: string;
}

export interface SessionStatusPayload {
  sessionId: string;
  requestId: string | null;
  lastIntent: IntentType | null;
  transcriptEntries: number;
  sessionSummary: string | null;
  updatedAt: string;
  contextUsage: {
    contextTokens: number;
    source: "provider" | "estimate";
    contextWindow: number;
    remainingTokens: number;
    percentUsed: number;
    compactionThresholdTokens: number;
  };
  lastUsage: UsageSnapshot | null;
  cumulativeUsage: UsageAggregate;
  specialistCount: number;
  specialists: SpecialistResult[];
  backtests: {
    queued: number;
    preparing: number;
    running: number;
    completed: number;
    failed: number;
    active: number;
    jobs: Array<{
      jobId: string;
      status: string;
      kind: string;
      symbols: string[];
      dateFrom: string;
      dateTo: string;
      runId: string | null;
      datasetId: string | null;
      submittedAt: string;
      startedAt: string | null;
      completedAt: string | null;
      deliveredAt: string | null;
      reportSummary: string | null;
      error: string | null;
    }>;
  };
  crons: {
    total: number;
    active: number;
    running: number;
    jobs: Array<{
      jobId: string;
      name: string;
      enabled: boolean;
      updatedAt: string;
      nextRunAt: string | null;
      lastOutcome: string;
    }>;
  };
}

export interface AgentRunResult {
  sessionFile: string | null;
  sessionId: string;
  message: string;
  compacted: boolean;
  toolCalls: ToolCallRecord[];
  usage: UsageAggregate;
}

export interface UsageCostSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface UsageSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  contextTokens: number;
  cost: UsageCostSnapshot;
}

export interface UsageAggregate extends UsageSnapshot {
  turns: number;
  contextTokens: number;
}

export interface SessionSpawnRequest {
  rootSessionId: string;
  requestId: string;
  requesterProfileId: AgentProfileId;
  profileId: AgentProfileId;
  task: string;
  rootUserMessage: string;
}

export interface TradeIntent {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType: "market" | "limit";
  limitPrice: number | null;
  rationale: string;
}

export interface TradeDecision {
  action: "buy" | "sell" | "hold";
  symbol: string;
  quantity: number | null;
  confidence: "low" | "medium" | "high";
  rationale: string;
  riskNotes: string[];
}

export type HoldingAction = "hold" | "reduce" | "add" | "exit" | "urgent_exit" | "watch";

export interface HoldingActionPlanItem {
  symbol: string;
  action: HoldingAction;
  confidence: number;
  rationale: string;
  riskNotes: string[];
  suggestedPositionChange: string;
  invalidation: string;
}

export interface HoldingActionPlan {
  asOf: string;
  summary: string;
  items: HoldingActionPlanItem[];
}

export interface CapitalAllocationGate {
  asOf: string;
  allowNewPositions: boolean;
  posture: "offensive" | "neutral" | "defensive";
  maxNewRiskBudget: number | null;
  rationale: string;
  constraints: string[];
}

export interface TradePlanEntry {
  symbol: string;
  market: string;
  action: "buy" | "watch" | "avoid";
  bucket: string;
  confidence: number;
  idealBuy: number | null;
  secondaryBuy: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  positionSize: string | null;
  strategyTags: string[];
  thesis: string;
  invalidation: string;
}

export interface TradePlan {
  date: string;
  createdAt: string;
  blockedSymbols: string[];
  entries: TradePlanEntry[];
}

export interface PreopenDecisionBundle {
  date: string;
  createdAt: string;
  capitalAllocationGate: CapitalAllocationGate;
  holdingActionPlan: HoldingActionPlan;
  tradePlan: TradePlan | null;
}

export interface MiddayActionAdvice {
  date: string;
  createdAt: string;
  exposureDirective: "expand" | "hold" | "shrink";
  holdings: string[];
  candidates: string[];
  doNotTrade: string[];
}

export interface PortfolioDailySnapshot {
  date: string;
  capturedAt: string;
  accountId: string;
  mode: string;
  cash: number;
  equity: number | null;
  buyingPower: number | null;
  positions: Position[];
  openOrders: Array<Record<string, unknown>>;
}

export interface EodSymbolAttribution {
  symbol: string;
  outcome: "positive" | "negative" | "mixed" | "neutral";
  attribution: string;
}

export interface EodAttributionReport {
  date: string;
  createdAt: string;
  selection: string;
  execution: string;
  sizing: string;
  discipline: string;
  lessons: string[];
  symbolAttributions: EodSymbolAttribution[];
}

export interface StrategyReviewReport {
  period: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  keptRules: string[];
  droppedRules: string[];
  favoredConditions: string[];
  adverseConditions: string[];
  lessons: string[];
}

export interface TradeExecutionRequest {
  action: "paper_buy" | "paper_sell";
  symbol: string;
  quantity: number;
  orderType: "market" | "limit";
  limitPrice: number | null;
  rationale: string;
}

export interface TradeExecutionResult {
  status: "filled" | "rejected";
  mode: "paper";
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number | null;
  message: string;
  snapshot: PortfolioSnapshot;
}

export interface ConfigSnapshot {
  target: "llm" | "mcp" | "all";
  llm?: {
    path: string | null;
    raw: string | null;
  };
  mcp?: {
    path: string;
    raw: string;
  };
}

export interface OpsExecutionResult {
  ok: boolean;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RuntimeStatusSnapshot {
  startedAt: string | null;
  lastReloadAt: string | null;
  lastReloadReason: string | null;
  reloadCount: number;
  reloadInFlight: boolean;
  pendingReason: string | null;
  lastError: string | null;
}

export interface MemoryArtifact {
  path: string;
  fileName: string;
  category: "daily" | "archive" | "bootstrap" | "knowledge" | "portfolio" | "other";
  updatedAt: string;
  excerpt: string;
}

export interface RuntimeInspectionPayload {
  status: RuntimeStatusSnapshot;
  cron?: {
    enabled: boolean;
    jobCount: number;
    activeJobCount: number;
    runningJobCount: number;
    lastTickAt: string | null;
    jobs?: Array<{
      id: string;
      name: string;
      enabled: boolean;
      updatedAt: string;
      nextRunAt: string | null;
      lastOutcome: string;
    }>;
  };
  skills: Array<{
    name: string;
    description: string;
    location: string;
  }>;
  mcp: Array<{
    server: string;
    toolCount: number;
  }>;
  recentMemory: MemoryArtifact[];
}
