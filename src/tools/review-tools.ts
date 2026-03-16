import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import type { ToolExecutionContext, ToolRegistryDeps } from "./contracts.js";
import { jsonToolResult, readObject } from "./support.js";

const holdingActionPlanItemSchema = Type.Object(
  {
    symbol: Type.String(),
    action: Type.String({
      enum: ["hold", "reduce", "add", "exit", "urgent_exit", "watch"] as never,
    }),
    confidence: Type.Number(),
    rationale: Type.String(),
    riskNotes: Type.Array(Type.String()),
    suggestedPositionChange: Type.String(),
    invalidation: Type.String(),
  },
  { additionalProperties: false },
);

const tradePlanEntrySchema = Type.Object(
  {
    symbol: Type.String(),
    market: Type.String(),
    action: Type.String({ enum: ["buy", "watch", "avoid"] as never }),
    bucket: Type.String(),
    confidence: Type.Number(),
    idealBuy: Type.Union([Type.Number(), Type.Null()]),
    secondaryBuy: Type.Union([Type.Number(), Type.Null()]),
    stopLoss: Type.Union([Type.Number(), Type.Null()]),
    takeProfit: Type.Union([Type.Number(), Type.Null()]),
    positionSize: Type.Union([Type.String(), Type.Null()]),
    strategyTags: Type.Array(Type.String()),
    thesis: Type.String(),
    invalidation: Type.String(),
  },
  { additionalProperties: false },
);

export function createReviewTools(
  deps: ToolRegistryDeps,
  _context: ToolExecutionContext,
): ToolDefinition[] {
  return [
    {
      name: "review_write_preopen_decision",
      label: "Review Write Preopen Decision",
      description:
        "Persist a structured preopen decision bundle with holding actions, capital gate, and optional trade plan.",
      parameters: Type.Object(
        {
          bundle: Type.Object(
            {
              date: Type.String(),
              createdAt: Type.String(),
              capitalAllocationGate: Type.Object(
                {
                  asOf: Type.String(),
                  allowNewPositions: Type.Boolean(),
                  posture: Type.String({ enum: ["offensive", "neutral", "defensive"] as never }),
                  maxNewRiskBudget: Type.Union([Type.Number(), Type.Null()]),
                  rationale: Type.String(),
                  constraints: Type.Array(Type.String()),
                },
                { additionalProperties: false },
              ),
              holdingActionPlan: Type.Object(
                {
                  asOf: Type.String(),
                  summary: Type.String(),
                  items: Type.Array(holdingActionPlanItemSchema),
                },
                { additionalProperties: false },
              ),
              tradePlan: Type.Union([
                Type.Null(),
                Type.Object(
                  {
                    date: Type.String(),
                    createdAt: Type.String(),
                    blockedSymbols: Type.Array(Type.String()),
                    entries: Type.Array(tradePlanEntrySchema),
                  },
                  { additionalProperties: false },
                ),
              ]),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId, params) => {
        const bundle = readObject(params, "bundle");
        const savedPath = await deps.reviews.savePreopenDecision(bundle as never);
        return jsonToolResult({ ok: true, path: savedPath, bundle });
      },
    },
    {
      name: "review_write_midday_advice",
      label: "Review Write Midday Advice",
      description: "Persist a structured midday action advice artifact.",
      parameters: Type.Object(
        {
          advice: Type.Object(
            {
              date: Type.String(),
              createdAt: Type.String(),
              exposureDirective: Type.String({ enum: ["expand", "hold", "shrink"] as never }),
              holdings: Type.Array(Type.String()),
              candidates: Type.Array(Type.String()),
              doNotTrade: Type.Array(Type.String()),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId, params) => {
        const advice = readObject(params, "advice");
        const savedPath = await deps.reviews.saveMiddayActionAdvice(advice as never);
        return jsonToolResult({ ok: true, path: savedPath, advice });
      },
    },
    {
      name: "review_write_portfolio_snapshot",
      label: "Review Write Portfolio Snapshot",
      description: "Persist a daily portfolio snapshot for end-of-day review and later aggregation.",
      parameters: Type.Object(
        {
          snapshot: Type.Object(
            {
              date: Type.String(),
              capturedAt: Type.String(),
              accountId: Type.String(),
              mode: Type.String(),
              cash: Type.Number(),
              equity: Type.Union([Type.Number(), Type.Null()]),
              buyingPower: Type.Union([Type.Number(), Type.Null()]),
              positions: Type.Array(Type.Object({}, { additionalProperties: true })),
              openOrders: Type.Array(Type.Object({}, { additionalProperties: true })),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId, params) => {
        const snapshot = readObject(params, "snapshot");
        const savedPath = await deps.reviews.savePortfolioDailySnapshot(snapshot as never);
        return jsonToolResult({ ok: true, path: savedPath, snapshot });
      },
    },
    {
      name: "review_write_eod_attribution",
      label: "Review Write EOD Attribution",
      description: "Persist a structured end-of-day attribution report.",
      parameters: Type.Object(
        {
          report: Type.Object(
            {
              date: Type.String(),
              createdAt: Type.String(),
              selection: Type.String(),
              execution: Type.String(),
              sizing: Type.String(),
              discipline: Type.String(),
              lessons: Type.Array(Type.String()),
              symbolAttributions: Type.Array(
                Type.Object(
                  {
                    symbol: Type.String(),
                    outcome: Type.String({ enum: ["positive", "negative", "mixed", "neutral"] as never }),
                    attribution: Type.String(),
                  },
                  { additionalProperties: false },
                ),
              ),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId, params) => {
        const report = readObject(params, "report");
        const savedPath = await deps.reviews.saveEodAttribution(report as never);
        return jsonToolResult({ ok: true, path: savedPath, report });
      },
    },
    {
      name: "review_write_strategy_review",
      label: "Review Write Strategy Review",
      description: "Persist a structured weekly or monthly strategy review artifact.",
      parameters: Type.Object(
        {
          review: Type.Object(
            {
              period: Type.String({ enum: ["weekly", "monthly"] as never }),
              periodStart: Type.String(),
              periodEnd: Type.String(),
              createdAt: Type.String(),
              keptRules: Type.Array(Type.String()),
              droppedRules: Type.Array(Type.String()),
              favoredConditions: Type.Array(Type.String()),
              adverseConditions: Type.Array(Type.String()),
              lessons: Type.Array(Type.String()),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId, params) => {
        const review = readObject(params, "review");
        const savedPath = await deps.reviews.saveStrategyReview(review as never);
        return jsonToolResult({ ok: true, path: savedPath, review });
      },
    },
  ];
}
