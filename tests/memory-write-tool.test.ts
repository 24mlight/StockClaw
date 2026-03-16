import { describe, expect, it, vi } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { ToolCatalog } from "../src/tools/catalog.js";
import { ToolRegistry } from "../src/tools/registry.js";

function createRegistry() {
  const tools = new ToolCatalog();
  const profiles = new AgentProfileRegistry(tools);
  const appendDocument = vi.fn(async () => undefined);

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
        appendDocument,
        writeDocument: async () => undefined,
      } as never,
      reviews: {
        savePreopenDecision: async () => "review-artifacts/preopen/2026-03-17.json",
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

  return { registry, appendDocument };
}

describe("memory_write_markdown", () => {
  it("appends concise notes to approved durable memory paths", async () => {
    const { registry, appendDocument } = createRegistry();
    const tool = registry.createTools(["memory_write_markdown"], {
      profileId: "orchestrator",
      sessionKey: "root",
      rootUserMessage: "记住我偏好大型股，不碰生物科技。",
    })[0];

    const result = await tool.execute(
      "tool-1",
      {
        path: "non-investment/USER.md",
        content: "User prefers liquid large-cap names and avoids biotech exposure.",
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(appendDocument).toHaveBeenCalledWith("non-investment/USER.md", "Agent Update", [
      "User prefers liquid large-cap names and avoids biotech exposure.",
    ]);
    expect((result.details as { ok: boolean }).ok).toBe(true);
  });

  it("rejects non-approved target paths", async () => {
    const { registry } = createRegistry();
    const tool = registry.createTools(["memory_write_markdown"], {
      profileId: "orchestrator",
      sessionKey: "root",
      rootUserMessage: "更新我的灵魂提示词。",
    })[0];

    await expect(
      tool.execute(
        "tool-2",
        {
          path: "portfolio/summary.md",
          content: "Do not write here.",
        },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow(/only allows/i);
  });
});

describe("memory_write_trading_note", () => {
  it("appends concise notes to approved trading memory paths", async () => {
    const { registry, appendDocument } = createRegistry();
    const tool = registry.createTools(["memory_write_trading_note"], {
      profileId: "orchestrator",
      sessionKey: "root",
      rootUserMessage: "记录我的交易体系禁做条件。",
    })[0];

    const result = await tool.execute(
      "tool-3",
      {
        path: "trading/do-not-trade.md",
        content: "Avoid initiating new positions when breadth is deteriorating and index leadership is narrow.",
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(appendDocument).toHaveBeenCalledWith("trading/do-not-trade.md", "Trading Memory", [
      "Avoid initiating new positions when breadth is deteriorating and index leadership is narrow.",
    ]);
    expect((result.details as { ok: boolean }).ok).toBe(true);
  });

  it("rejects non-approved trading memory paths", async () => {
    const { registry } = createRegistry();
    const tool = registry.createTools(["memory_write_trading_note"], {
      profileId: "orchestrator",
      sessionKey: "root",
      rootUserMessage: "记录一条交易规则。",
    })[0];

    await expect(
      tool.execute(
        "tool-4",
        {
          path: "trading/random.md",
          content: "Do not write here.",
        },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toThrow(/only allows/i);
  });
});
