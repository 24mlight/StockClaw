import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import type { ToolExecutionContext, ToolRegistryDeps } from "./contracts.js";
import { jsonToolResult, optionalNumber, readObject, readString, requiredString } from "./support.js";

const SUPPORTED_WORKFLOW_TURNS = [
  "preopen_holding_review",
  "candidate_deep_analysis",
  "midday_action_mode",
  "eod_attribution",
  "weekly_strategy_review",
  "monthly_strategy_review",
] as const;

export function createCronTools(
  deps: ToolRegistryDeps,
  context: ToolExecutionContext,
): ToolDefinition[] {
  return [
    {
      name: "cron",
      label: "Cron",
      description:
        "Manage scheduled jobs for price alerts, recurring portfolio reviews, recurring watchlist checks, reminders, and explicit timed agent turns. For autonomous paper trading, use the structured trade_automation action instead of a vague free-form agent_turn message. Use only when the user explicitly asks for ongoing monitoring or scheduled automation.",
      parameters: Type.Object({
        action: Type.String({ enum: ["status", "list", "add", "update", "remove", "run"] as never }),
        jobId: Type.Optional(Type.String()),
        job: Type.Optional(Type.Object({}, { additionalProperties: true })),
        patch: Type.Optional(Type.Object({}, { additionalProperties: true })),
      }),
      execute: async (_toolCallId, params) => {
        const action = requiredString(params, "action");
        switch (action) {
          case "status":
            return jsonToolResult(await deps.cron.inspect());
          case "list":
            return jsonToolResult(await deps.cron.listJobs());
          case "add": {
            const job = readObject(params, "job");
            return jsonToolResult(
              await deps.cron.addJob({
                name: readString(job, "name"),
                enabled: readEnabled(job),
                trigger: readCronTrigger(job),
                action: readCronAction(job),
                target: readCronTarget(job, context),
              }),
            );
          }
          case "update": {
            const jobId = requiredString(params, "jobId");
            const patch = readObject(params, "patch");
            return jsonToolResult(
              await deps.cron.updateJob(jobId, {
                name: readString(patch, "name"),
                enabled: readEnabled(patch),
                trigger: hasObject(patch, "trigger") || looksLikeInlineTrigger(patch) ? readCronTrigger(patch) : undefined,
                action: hasObject(patch, "action") || looksLikeInlineAction(patch) ? readCronAction(patch) : undefined,
                target: hasObject(patch, "target") || looksLikeInlineTarget(patch)
                  ? readCronTarget(patch, context)
                  : undefined,
              }),
            );
          }
          case "remove":
            return jsonToolResult(await deps.cron.removeJob(requiredString(params, "jobId")));
          case "run":
            return jsonToolResult(await deps.cron.runJob(requiredString(params, "jobId"), "manual"));
          default:
            throw new Error(`Unsupported cron action '${action}'.`);
        }
      },
    },
  ];
}

function readEnabled(params: unknown): boolean | undefined {
  const raw = params && typeof params === "object" ? (params as Record<string, unknown>).enabled : undefined;
  return typeof raw === "boolean" ? raw : undefined;
}

function readCronTrigger(params: Record<string, unknown>) {
  const trigger = hasObject(params, "trigger") ? readObject(params, "trigger") : params;
  const kind = readString(trigger, "kind") || readString(trigger, "type");
  if (!kind) {
    throw new Error("cron trigger requires a kind.");
  }
  if (kind === "at") {
    const at = readString(trigger, "at") || readString(trigger, "time");
    if (!at) {
      throw new Error("at trigger requires at.");
    }
    return { kind: "at" as const, at };
  }
  if (kind === "every") {
    const everyMs = optionalNumber(trigger, "everyMs") ?? optionalNumber(trigger, "intervalMs");
    if (everyMs == null || everyMs <= 0) {
      throw new Error("every trigger requires everyMs.");
    }
    return {
      kind: "every" as const,
      everyMs,
      anchorAt: readString(trigger, "anchorAt") || readString(trigger, "startAt") || null,
    };
  }
  if (kind === "cron") {
    const expr = readString(trigger, "expr") || readString(trigger, "expression");
    if (!expr) {
      throw new Error("cron trigger requires expr.");
    }
    return {
      kind: "cron" as const,
      expr,
      tz: readString(trigger, "tz") || readString(trigger, "timezone") || null,
    };
  }
  if (kind === "price") {
    const thresholds = readObject(trigger, "thresholds");
    const symbol =
      readString(trigger, "symbol") || readString(trigger, "ticker") || readString(trigger, "code");
    const above =
      optionalNumber(trigger, "above") ??
      optionalNumber(trigger, "takeProfit") ??
      optionalNumber(thresholds, "above") ??
      optionalNumber(thresholds, "takeProfit");
    const below =
      optionalNumber(trigger, "below") ??
      optionalNumber(trigger, "stopLoss") ??
      optionalNumber(thresholds, "below") ??
      optionalNumber(thresholds, "stopLoss");
    if (!symbol) {
      throw new Error("price trigger requires symbol.");
    }
    if (above == null && below == null) {
      throw new Error("price trigger requires above or below.");
    }
    return {
      kind: "price" as const,
      symbol,
      above,
      below,
      checkEveryMs:
        optionalNumber(trigger, "checkEveryMs") ?? optionalNumber(trigger, "intervalMs") ?? undefined,
    };
  }
  throw new Error(`Unsupported cron trigger kind '${kind}'.`);
}

function readCronAction(params: Record<string, unknown>) {
  const action = hasObject(params, "action") ? readObject(params, "action") : params;
  const kind = readString(action, "kind") || readString(action, "type");
  const message = readString(action, "message") || readString(params, "message");
  if (kind === "notify") {
    if (!message) {
      throw new Error("notify action requires message.");
    }
    return { kind: "notify" as const, message };
  }
  if (kind === "agent_turn") {
    if (!message) {
      throw new Error("agent_turn action requires message.");
    }
    return { kind: "agent_turn" as const, message };
  }
  if (kind === "workflow_turn") {
    const workflow = readString(action, "workflow") || readString(params, "workflow");
    if (!isSupportedWorkflowTurn(workflow)) {
      throw new Error("workflow_turn action requires a supported workflow.");
    }
    if (!message) {
      throw new Error("workflow_turn action requires message.");
    }
    return { kind: "workflow_turn" as const, workflow, message };
  }
  if (kind === "trade_automation") {
    const symbol =
      readString(action, "symbol") ||
      readString(action, "ticker") ||
      readString(action, "code") ||
      readString(params, "symbol") ||
      readString(params, "ticker") ||
      readString(params, "code");
    const side = readString(action, "side") || readString(params, "side");
    const quantityMode =
      readString(action, "quantityMode") ||
      readString(action, "sizingRule") ||
      readString(params, "quantityMode") ||
      readString(params, "sizingRule");
    const orderType = readString(action, "orderType") || readString(params, "orderType") || "market";
    const limitPrice = optionalNumber(action, "limitPrice") ?? optionalNumber(params, "limitPrice");
    const quantity = optionalNumber(action, "quantity") ?? optionalNumber(params, "quantity");
    const rationale = readString(action, "rationale") || readString(params, "rationale");

    if (!symbol) {
      throw new Error("trade_automation action requires symbol.");
    }
    if (side !== "buy" && side !== "sell") {
      throw new Error("trade_automation action requires side buy or sell.");
    }
    if (
      quantityMode !== "all" &&
      quantityMode !== "half" &&
      quantityMode !== "fraction" &&
      quantityMode !== "shares"
    ) {
      throw new Error("trade_automation action requires quantityMode all, half, fraction, or shares.");
    }
    if (quantityMode === "shares" && (quantity == null || quantity <= 0)) {
      throw new Error("trade_automation action with quantityMode=shares requires quantity.");
    }
    if (quantityMode === "fraction" && (quantity == null || quantity <= 0 || quantity > 1)) {
      throw new Error("trade_automation action with quantityMode=fraction requires quantity between 0 and 1.");
    }
    if (orderType !== "market" && orderType !== "limit") {
      throw new Error("trade_automation action requires orderType market or limit.");
    }
    if (orderType === "limit" && (limitPrice == null || limitPrice <= 0)) {
      throw new Error("trade_automation action with orderType=limit requires limitPrice.");
    }
    if (!rationale) {
      throw new Error("trade_automation action requires rationale.");
    }
    return {
      kind: "trade_automation" as const,
      symbol,
      side: side as "buy" | "sell",
      quantityMode: quantityMode as "all" | "half" | "fraction" | "shares",
      quantity,
      orderType: orderType as "market" | "limit",
      limitPrice,
      rationale,
    };
  }
  throw new Error("cron action requires kind notify, agent_turn, workflow_turn, or trade_automation.");
}

function readCronTarget(params: Record<string, unknown>, context: ToolExecutionContext) {
  const target = hasObject(params, "target") ? readObject(params, "target") : params;
  const channel = readString(target, "channel");
  return {
    sessionId: readString(target, "sessionId") || context.sessionKey,
    channel: channel === "telegram" || channel === "web" ? channel : inferDefaultChannel(context),
    userId: readString(target, "userId") || inferDefaultUserId(context),
  };
}

function inferDefaultChannel(context: ToolExecutionContext): "web" | "telegram" {
  if (context.sessionKey.startsWith("telegram:")) {
    return "telegram";
  }
  return "web";
}

function inferDefaultUserId(context: ToolExecutionContext): string {
  if (context.sessionKey.startsWith("telegram:")) {
    const suffix = context.sessionKey.slice("telegram:".length);
    return `telegram:${suffix}`;
  }
  return "web-user";
}

function hasObject(params: Record<string, unknown>, key: string): boolean {
  const value = params[key];
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looksLikeInlineTrigger(params: Record<string, unknown>): boolean {
  return Boolean(
    readString(params, "kind") ||
      readString(params, "type") ||
      readString(params, "symbol") ||
      readString(params, "ticker") ||
      readString(params, "code") ||
      optionalNumber(params, "above") != null ||
      optionalNumber(params, "below") != null,
  );
}

function looksLikeInlineAction(params: Record<string, unknown>): boolean {
  const kind = readString(params, "kind") || readString(params, "type");
  return kind === "notify" || kind === "agent_turn" || kind === "workflow_turn" || kind === "trade_automation";
}

function isSupportedWorkflowTurn(
  workflow: string | undefined,
): workflow is (typeof SUPPORTED_WORKFLOW_TURNS)[number] {
  return Boolean(workflow && SUPPORTED_WORKFLOW_TURNS.includes(workflow as (typeof SUPPORTED_WORKFLOW_TURNS)[number]));
}

function looksLikeInlineTarget(params: Record<string, unknown>): boolean {
  return Boolean(readString(params, "sessionId") || readString(params, "userId") || readString(params, "channel"));
}
