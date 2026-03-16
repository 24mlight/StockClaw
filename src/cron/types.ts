import type { ChannelType, IntentType, UserResponsePayload } from "../types.js";

export type CronTrigger =
  | {
      kind: "at";
      at: string;
    }
  | {
      kind: "every";
      everyMs: number;
      anchorAt?: string | null;
    }
  | {
      kind: "cron";
      expr: string;
      tz?: string | null;
    }
  | {
      kind: "price";
      symbol: string;
      above?: number | null;
      below?: number | null;
      checkEveryMs?: number | null;
    };

export type CronAction =
  | {
      kind: "agent_turn";
      message: string;
    }
  | {
      kind: "workflow_turn";
      workflow:
        | "preopen_holding_review"
        | "candidate_deep_analysis"
        | "midday_action_mode"
        | "eod_attribution"
        | "weekly_strategy_review"
        | "monthly_strategy_review";
      message: string;
    }
  | {
      kind: "trade_automation";
      symbol: string;
      side: "buy" | "sell";
      quantityMode: "all" | "half" | "fraction" | "shares";
      quantity?: number | null;
      orderType: "market" | "limit";
      limitPrice?: number | null;
      rationale: string;
    }
  | {
      kind: "notify";
      message: string;
    };

export interface CronTarget {
  sessionId: string;
  channel: ChannelType;
  userId: string;
}

export interface CronJobState {
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOutcome: "idle" | "running" | "succeeded" | "failed";
  lastError: string | null;
  runCount: number;
  lastObservedPrice: number | null;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  trigger: CronTrigger;
  action: CronAction;
  target: CronTarget;
  createdAt: string;
  updatedAt: string;
  state: CronJobState;
}

export interface CronJobCreateInput {
  name?: string | null;
  enabled?: boolean;
  trigger: CronTrigger;
  action: CronAction;
  target: CronTarget;
}

export interface CronJobPatch {
  name?: string;
  enabled?: boolean;
  trigger?: CronTrigger;
  action?: CronAction;
  target?: CronTarget;
}

export interface CronStatusSnapshot {
  enabled: boolean;
  jobCount: number;
  activeJobCount: number;
  runningJobCount: number;
  lastTickAt: string | null;
}

export interface CronExecutionRecord {
  jobId: string;
  jobName: string;
  triggeredAt: string;
  reason: "schedule" | "manual";
  status: "succeeded" | "failed";
  message: string;
  response?: UserResponsePayload;
}

export interface CronNotification {
  sessionId: string;
  channel: ChannelType;
  userId: string;
  message: string;
  intent?: IntentType;
  timestamp: string;
  requestId: string;
  blocks?: UserResponsePayload["blocks"];
}

export interface CronInspectionPayload {
  status: CronStatusSnapshot;
  jobs: CronJob[];
}
