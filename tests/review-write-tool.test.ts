import { describe, expect, it, vi } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { ToolPolicyService } from "../src/control/tool-policy.js";
import { ToolCatalog } from "../src/tools/catalog.js";
import { ToolRegistry } from "../src/tools/registry.js";

function createRegistry() {
  const tools = new ToolCatalog();
  const profiles = new AgentProfileRegistry(tools);
  const savePreopenDecision = vi.fn(async () => "review-artifacts/preopen/2026-03-17.json");
  const saveMiddayActionAdvice = vi.fn(async () => "review-artifacts/midday/2026-03-17.json");
  const savePortfolioDailySnapshot = vi.fn(async () => "portfolio-snapshots/2026-03-17.json");
  const saveEodAttribution = vi.fn(async () => "review-artifacts/eod/2026-03-17.json");
  const saveStrategyReview = vi.fn(async () => "review-artifacts/weekly/2026-03-10_2026-03-14.json");

  const registry = new ToolRegistry(
    {
      profiles,
      mcpRuntime: {
        listTools: () => [],
        createPiCustomTools: () => [],
      } as never,
      portfolio: {
        load: async () => ({
          accountId: "paper",
          mode: "paper",
          cash: 1000,
          equity: 1000,
          buyingPower: 1000,
          positions: [],
          openOrders: [],
          updatedAt: new Date().toISOString(),
        }),
        replace: async (snapshot: unknown) => snapshot,
        patch: async (snapshot: unknown) => snapshot,
      } as never,
      memory: {
        readCategory: async () => [],
        appendDocument: async () => undefined,
        writeDocument: async () => undefined,
      } as never,
      reviews: {
        savePreopenDecision,
        saveMiddayActionAdvice,
        savePortfolioDailySnapshot,
        saveEodAttribution,
        saveStrategyReview,
      } as never,
      executor: {
        execute: async () => ({}),
      } as never,
      backtests: {
        prepareAsset: async () => ({}),
        preparePortfolio: async () => ({}),
        prepareCurrentPortfolio: async () => ({}),
        runDataset: async () => ({}),
        backtestAsset: async () => ({}),
        backtestPortfolio: async () => ({}),
        backtestCurrentPortfolio: async () => ({}),
      } as never,
      cron: {
        inspect: async () => ({
          status: {
            enabled: true,
            jobCount: 0,
            activeJobCount: 0,
            runningJobCount: 0,
            lastTickAt: null,
          },
          jobs: [],
        }),
        listJobs: async () => [],
        addJob: async () => ({ id: "job-1" }),
        updateJob: async () => ({ id: "job-1" }),
        removeJob: async () => ({ ok: true, jobId: "job-1" }),
        runJob: async () => ({ jobId: "job-1", status: "succeeded" }),
      } as never,
      config: {
        getSnapshot: async () => ({ target: "all" }),
        patchConfig: async () => ({ target: "mcp" }),
        applyConfig: async () => ({ target: "mcp" }),
      } as never,
      ops: {
        installMcp: async () => ({ ok: true }),
        installSkill: async () => ({ ok: true }),
        verifyRuntime: async () => ({ ok: true }),
      } as never,
      restart: {
        requestRestart: async () => ({
          ok: true,
          action: "restart_runtime",
          message: "scheduled",
          details: {
            sessionId: "root",
            channel: "web",
            note: "scheduled",
            reason: null,
            requestedAt: new Date().toISOString(),
          },
        }),
      } as never,
      sessions: {
        getSession: async () => null,
      } as never,
      telegram: {
        sendSessionFile: async () => ({
          sessionId: "telegram:1",
          chatId: "1",
          fileName: "analysis.md",
        }),
      } as never,
    },
    tools,
  );

  return {
    registry,
    tools,
    profiles,
    savePreopenDecision,
    saveMiddayActionAdvice,
    savePortfolioDailySnapshot,
    saveEodAttribution,
    saveStrategyReview,
  };
}

describe("review_write_preopen_decision", () => {
  it("persists a structured preopen decision bundle", async () => {
    const { registry, savePreopenDecision } = createRegistry();
    const tool = registry.createTools(["review_write_preopen_decision"], {
      profileId: "orchestrator",
      sessionKey: "root",
      rootUserMessage: "开盘前先审视持仓和仓位闸门。",
    })[0];

    const result = await tool.execute(
      "tool-1",
      {
        bundle: {
          date: "2026-03-17",
          createdAt: "2026-03-17T08:45:00.000Z",
          capitalAllocationGate: {
            asOf: "2026-03-17T08:30:00.000Z",
            allowNewPositions: false,
            posture: "defensive",
            maxNewRiskBudget: 0,
            rationale: "Risk is already concentrated.",
            constraints: ["No new positions."],
          },
          holdingActionPlan: {
            asOf: "2026-03-17T08:40:00.000Z",
            summary: "Trim oversized winners.",
            items: [
              {
                symbol: "NVDA.US",
                action: "reduce",
                confidence: 0.8,
                rationale: "Position size is too large for the gate.",
                riskNotes: ["Gap risk"],
                suggestedPositionChange: "-25%",
                invalidation: "Breadth improves.",
              },
            ],
          },
          tradePlan: null,
        },
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(savePreopenDecision).toHaveBeenCalledOnce();
    expect((result.details as { path: string }).path).toBe("review-artifacts/preopen/2026-03-17.json");
  });

  it("is available to the root orchestrator tool policy", () => {
    const { registry, tools, profiles } = createRegistry();
    const policy = new ToolPolicyService(profiles, registry, tools);

    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("review_write_preopen_decision");
  });

  it("persists end-of-day review artifacts", async () => {
    const {
      registry,
      saveMiddayActionAdvice,
      savePortfolioDailySnapshot,
      saveEodAttribution,
      saveStrategyReview,
    } = createRegistry();
    const [middayTool, snapshotTool, eodTool, strategyTool] = registry.createTools(
      [
        "review_write_midday_advice",
        "review_write_portfolio_snapshot",
        "review_write_eod_attribution",
        "review_write_strategy_review",
      ],
      {
        profileId: "orchestrator",
        sessionKey: "root",
        rootUserMessage: "收盘后落盘复盘结果。",
      },
    );

    const middayResult = await middayTool!.execute(
      "tool-2",
      {
        advice: {
          date: "2026-03-17",
          createdAt: "2026-03-17T12:30:00.000Z",
          exposureDirective: "shrink",
          holdings: ["Trim NVDA.US into strength."],
          candidates: ["Avoid fresh entries unless breadth improves."],
          doNotTrade: ["Do not chase thin momentum names."],
        },
      },
      undefined,
      undefined,
      undefined as never,
    );
    const snapshotResult = await snapshotTool!.execute(
      "tool-3",
      {
        snapshot: {
          date: "2026-03-17",
          capturedAt: "2026-03-17T16:00:00.000Z",
          accountId: "paper",
          mode: "paper",
          cash: 25000,
          equity: 103000,
          buyingPower: 25000,
          positions: [],
          openOrders: [],
        },
      },
      undefined,
      undefined,
      undefined as never,
    );
    const eodResult = await eodTool!.execute(
      "tool-4",
      {
        report: {
          date: "2026-03-17",
          createdAt: "2026-03-17T16:15:00.000Z",
          selection: "Solid stock selection.",
          execution: "Entries were late.",
          sizing: "Exposure stayed too high.",
          discipline: "One stop violation.",
          lessons: ["Reduce correlated exposure earlier."],
          symbolAttributions: [],
        },
      },
      undefined,
      undefined,
      undefined as never,
    );
    const strategyResult = await strategyTool!.execute(
      "tool-5",
      {
        review: {
          period: "weekly",
          periodStart: "2026-03-10",
          periodEnd: "2026-03-14",
          createdAt: "2026-03-14T18:00:00.000Z",
          keptRules: ["Only add into strength."],
          droppedRules: ["No blind first-candle fades."],
          favoredConditions: ["Broad leadership"],
          adverseConditions: ["Gap-and-fade"],
          lessons: ["Size down faster in chop."],
        },
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(saveMiddayActionAdvice).toHaveBeenCalledOnce();
    expect(savePortfolioDailySnapshot).toHaveBeenCalledOnce();
    expect(saveEodAttribution).toHaveBeenCalledOnce();
    expect(saveStrategyReview).toHaveBeenCalledOnce();
    expect((middayResult.details as { path: string }).path).toBe("review-artifacts/midday/2026-03-17.json");
    expect((snapshotResult.details as { path: string }).path).toBe("portfolio-snapshots/2026-03-17.json");
    expect((eodResult.details as { path: string }).path).toBe("review-artifacts/eod/2026-03-17.json");
    expect((strategyResult.details as { path: string }).path).toBe(
      "review-artifacts/weekly/2026-03-10_2026-03-14.json",
    );
  });
});
