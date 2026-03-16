import { describe, expect, it, vi } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { ToolCatalog } from "../src/tools/catalog.js";
import { ToolRegistry } from "../src/tools/registry.js";

describe("backtest tools", () => {
  it("wires end-to-end wrapper tools through the registry", async () => {
    const tools = new ToolCatalog();
    const profiles = new AgentProfileRegistry(tools);
    const submitAssetJob = vi.fn(async () => ({
      jobId: "job-1",
      parentSessionId: "web:test",
      status: "queued" as const,
      kind: "asset" as const,
      symbols: ["AAPL.US"],
      dateFrom: "2026-01-02",
      dateTo: "2026-01-05",
      submittedAt: "2026-01-02T00:00:00.000Z",
      note: "queued",
    }));
    const registry = new ToolRegistry(
      {
        profiles,
        mcpRuntime: { listTools: () => [] } as never,
        portfolio: {} as never,
        memory: {} as never,
        reviews: {
          savePreopenDecision: async () => "review-artifacts/preopen/2026-03-17.json",
        } as never,
        executor: {} as never,
        backtests: {
          prepareAsset: async () => ({}),
          preparePortfolio: async () => ({}),
          prepareCurrentPortfolio: async () => ({}),
          runDataset: async () => ({}),
          backtestAsset: async () => ({}),
          backtestPortfolio: async () => ({}),
          backtestCurrentPortfolio: async () => ({}),
          submitAssetJob,
          submitPortfolioJob: async () => ({}),
          submitCurrentPortfolioJob: async () => ({}),
        } as never,
        cron: {} as never,
        config: {} as never,
        ops: {} as never,
        restart: {} as never,
        sessions: {} as never,
        telegram: {} as never,
      },
      tools,
    );

    const tool = registry.createTools(["backtest_asset"], {
      profileId: "orchestrator",
      sessionKey: "web:test",
      rootUserMessage: "请回测 AAPL。",
    })[0];

    const result = await tool.execute(
      "tool-1",
      {
        symbol: "AAPL",
        dateFrom: "2026-01-02",
        dateTo: "2026-01-05",
        initialCash: 1000,
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(submitAssetJob).toHaveBeenCalled();
    expect((result.details as { jobId: string; status: string }).jobId).toBe("job-1");
    expect((result.details as { jobId: string; status: string }).status).toBe("queued");
  });
});
