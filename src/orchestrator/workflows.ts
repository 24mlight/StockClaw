import type { IntentType } from "../types.js";

const AUTOMATION_WORKFLOW_MAP = {
  preopen_holding_review: "holding_first_review",
  candidate_deep_analysis: "candidate_deep_analysis",
  midday_action_mode: "midday_action_mode",
  eod_attribution: "eod_attribution",
  weekly_strategy_review: "weekly_strategy_review",
  monthly_strategy_review: "monthly_strategy_review",
} as const;

export type RootWorkflowName =
  | "general_chat"
  | "portfolio_review"
  | "holding_first_review"
  | "candidate_deep_analysis"
  | "midday_action_mode"
  | "eod_attribution"
  | "weekly_strategy_review"
  | "monthly_strategy_review";

export function resolveWorkflowName(
  intent: IntentType,
  metadata: Record<string, unknown> = {},
): RootWorkflowName {
  const automationMode = metadata.source === "cron" && typeof metadata.automationMode === "string"
    ? metadata.automationMode
    : null;
  if (automationMode && automationMode in AUTOMATION_WORKFLOW_MAP) {
    return AUTOMATION_WORKFLOW_MAP[automationMode as keyof typeof AUTOMATION_WORKFLOW_MAP];
  }
  if (intent === "portfolio_review") {
    return "portfolio_review";
  }
  return "general_chat";
}
