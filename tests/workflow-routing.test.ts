import { describe, expect, it, vi } from "vitest";

import { ResearchCoordinator } from "../src/agents/coordinator.js";
import { classifyIntent } from "../src/orchestrator/intents.js";
import { resolveWorkflowName } from "../src/orchestrator/workflows.js";
import type { UserRequest } from "../src/types.js";

describe("workflow routing", () => {
  it("routes portfolio review intent to the portfolio review workflow", () => {
    expect(resolveWorkflowName("portfolio_review", {})).toBe("portfolio_review");
  });

  it("routes preopen automation to the holding-first workflow", () => {
    expect(
      resolveWorkflowName("portfolio_review", {
        source: "cron",
        automationMode: "preopen_holding_review",
      }),
    ).toBe("holding_first_review");
  });

  it("routes candidate automation to the candidate deep analysis workflow", () => {
    expect(
      resolveWorkflowName("investment_research", {
        source: "cron",
        automationMode: "candidate_deep_analysis",
      }),
    ).toBe("candidate_deep_analysis");
  });

  it("routes midday and end-of-day automation to their dedicated workflows", () => {
    expect(resolveWorkflowName("chat", { source: "cron", automationMode: "midday_action_mode" })).toBe(
      "midday_action_mode",
    );
    expect(resolveWorkflowName("chat", { source: "cron", automationMode: "eod_attribution" })).toBe(
      "eod_attribution",
    );
  });

  it("routes weekly and monthly automation to their review workflows", () => {
    expect(resolveWorkflowName("chat", { source: "cron", automationMode: "weekly_strategy_review" })).toBe(
      "weekly_strategy_review",
    );
    expect(resolveWorkflowName("chat", { source: "cron", automationMode: "monthly_strategy_review" })).toBe(
      "monthly_strategy_review",
    );
  });

  it("falls back to general chat for ordinary research requests", () => {
    expect(resolveWorkflowName("investment_research", {})).toBe("general_chat");
  });

  it("routes portfolio analysis requests to portfolio review even when research language is used", () => {
    expect(
      resolveWorkflowName(
        classifyIntent("Analyze my portfolio and tell me what to do with each position."),
        {},
      ),
    ).toBe("portfolio_review");
  });

  it("ignores automationMode outside cron requests", () => {
    expect(resolveWorkflowName("chat", { automationMode: "midday_action_mode" })).toBe("general_chat");
    expect(resolveWorkflowName("portfolio_review", { automationMode: "eod_attribution" })).toBe("portfolio_review");
  });
});

describe("ResearchCoordinator workflow prompt selection", () => {
  it("uses the routed workflow prompt for portfolio review requests", async () => {
    let capturedUserPrompt = "";

    const coordinator = new ResearchCoordinator(
      {
        runPersistent: vi.fn(async (params: { userPrompt: string }) => {
          capturedUserPrompt = params.userPrompt;
          return {
            sessionId: "session-1",
            message: "ok",
            compacted: false,
            toolCalls: [],
            usage: {
              turns: 1,
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              contextTokens: 2,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          };
        }),
      } as never,
      {
        composeAgentPrompt: vi.fn(async () => "base prompt"),
        composeWorkflowPrompt: vi.fn(async (workflowName: string) => `workflow:${workflowName}`),
      } as never,
      {
        root: "memory",
        readCategory: vi.fn(async () => []),
        readDocument: vi.fn(async () => null),
      } as never,
      {
        load: vi.fn(async () => ({
          accountId: "paper",
          mode: "paper",
          cash: 1000,
          equity: 1000,
          buyingPower: 1000,
          positions: [],
          openOrders: [],
          updatedAt: new Date().toISOString(),
        })),
      } as never,
      {
        get: vi.fn(() => ({ id: "orchestrator" })),
      } as never,
      {
        createTools: vi.fn(() => []),
      } as never,
      {
        history: vi.fn(async () => []),
      } as never,
    );

    const request: UserRequest = {
      requestId: "req-1",
      channel: "web",
      userId: "user-1",
      sessionId: "session-1",
      message: "Review my portfolio and tell me what to do with each position.",
      timestamp: "2026-03-16T06:00:00.000Z",
      metadata: {},
    };

    await coordinator.runRootTurn(request);

    expect(capturedUserPrompt).toContain("workflow:portfolio_review");
    expect(capturedUserPrompt).not.toContain("workflow:general_chat");
  });
});
