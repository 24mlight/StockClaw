import { describe, expect, it } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { ToolPolicyService } from "../src/control/tool-policy.js";
import { ToolCatalog } from "../src/tools/catalog.js";
import { ToolRegistry } from "../src/tools/registry.js";

function createRegistry() {
  const tools = new ToolCatalog();
  const profiles = new AgentProfileRegistry(tools);
  const mcpRuntime = {
    listTools: () => [
      { name: "get_quotes", description: "quote" },
      { name: "get_stock_news", description: "news" },
    ],
    createPiCustomTools: () =>
      ["get_quotes", "get_stock_news"].map((name) => ({
        name,
        label: name,
        description: name,
        parameters: {},
        execute: async () => ({ content: [{ type: "text", text: name }] }),
      })),
  };

  return {
    tools,
    profiles,
    registry: new ToolRegistry(
      {
        profiles,
        mcpRuntime: mcpRuntime as never,
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
        } as never,
        memory: {
          readCategory: async () => [],
          appendDocument: async () => undefined,
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
            status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null },
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
    ),
  };
}

describe("ToolPolicyService", () => {
  it("removes mutation tools for readonly trade checks", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("trade_executor", { mode: "readonly" })).toEqual([
      "memory_search",
      "memory_get",
      "memory_read",
      "portfolio_read",
      "portfolio_summary",
    ]);
  });

  it("keeps system ops admin tools on root runs", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("system_ops")).toEqual([
      "memory_search",
      "memory_get",
      "memory_read",
      "config_get",
      "config_patch",
      "config_apply",
      "install_mcp",
      "install_skill",
      "verify_runtime",
      "restart_runtime",
      "exec_command",
      "web_search",
      "web_fetch",
      "cron",
    ]);
  });

  it("allows root orchestrator to use session spawn tools", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("sessions_spawn");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("sessions_list");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("sessions_history");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("session_status");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("memory_write_markdown");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("backtest_asset");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("install_skill");
    expect(policy.resolveAllowedToolNames("orchestrator")).toContain("verify_runtime");
  });

  it("keeps portfolio subagents focused on portfolio state tools", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("portfolio_agent", { scope: "subagent" })).toEqual([
      "memory_search",
      "memory_get",
      "memory_read",
      "portfolio_read",
      "portfolio_summary",
      "portfolio_patch",
      "portfolio_replace",
    ]);
  });

  it("allows trade executor subagents to use paper trade tools without general memory writes", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("trade_executor", { scope: "subagent" })).toEqual([
      "memory_search",
      "memory_get",
      "memory_read",
      "portfolio_read",
      "portfolio_summary",
      "paper_trade_buy",
      "paper_trade_sell",
    ]);
  });

  it("allows system ops subagents to use control-plane tools", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("system_ops", { scope: "subagent" })).toEqual([
      "memory_search",
      "memory_get",
      "memory_read",
      "config_get",
      "config_patch",
      "config_apply",
      "install_mcp",
      "install_skill",
      "verify_runtime",
      "restart_runtime",
      "exec_command",
      "web_search",
      "web_fetch",
      "cron",
    ]);
  });

  it("keeps exec_command available to read-only research subagents", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("technical_analyst", { scope: "subagent" })).toEqual([
      "memory_search",
      "memory_get",
      "memory_read",
      "exec_command",
      "web_search",
      "web_fetch",
    ]);
  });

  it("removes session tools from subagents", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("orchestrator", { scope: "subagent" })).not.toContain(
      "sessions_spawn",
    );
  });

  it("auto-includes base tools for every profile", () => {
    const deps = createRegistry();
    const policy = new ToolPolicyService(deps.profiles, deps.registry, deps.tools);

    expect(policy.resolveAllowedToolNames("system_ops")).toContain("memory_search");
    expect(policy.resolveAllowedToolNames("value_analyst")).toContain("memory_get");
    expect(policy.resolveAllowedToolNames("trade_executor")).toContain("memory_read");
  });
});
