import os from "node:os";
import path from "node:path";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { SessionSpawnService } from "../src/agents/spawn-service.js";
import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { ToolPolicyService } from "../src/control/tool-policy.js";
import { PromptRegistry } from "../src/prompts/registry.js";
import { SessionService } from "../src/sessions/service.js";
import { SpawnStore } from "../src/state/spawn-store.js";
import { AppSessionStore } from "../src/state/app-session-store.js";
import { ToolCatalog } from "../src/tools/catalog.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { MemoryService } from "../src/memory/service.js";
import { buildLiveSessionSummaryPath } from "../src/memory/session-summary.js";

function createRegistry() {
  const tools = new ToolCatalog();
  const profiles = new AgentProfileRegistry(tools);
  const mcpRuntime = {
    listTools: () => [],
  };

  const registry = new ToolRegistry({
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
        submitAssetJob: async () => ({}),
        submitPortfolioJob: async () => ({}),
        submitCurrentPortfolioJob: async () => ({}),
        getSessionJobsSnapshot: async () => ({
          counts: { queued: 0, preparing: 0, running: 0, completed: 0, failed: 0, active: 0 },
          jobs: [],
        }),
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
  );

  return { tools, profiles, registry };
}

describe("SessionSpawnService", () => {
  it("spawns a specialist run and records it in history", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-spawn-"));
    const { tools, profiles, registry } = createRegistry();
    const policy = new ToolPolicyService(profiles, registry, tools);
    const sessionService = new SessionService(new AppSessionStore(path.join(dir, "app-sessions.json")));
    await sessionService.createSession({ sessionId: "root", userId: "user", channel: "web" });
    const service = new SessionSpawnService(
      {
        runEphemeral: async () => ({
          sessionFile: null,
          sessionId: "root:req:value_analyst:1",
          message: "value summary",
          compacted: false,
          toolCalls: [{ toolName: "exec_command", args: { command: "mcporter list" } }],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            turns: 1,
            contextTokens: 30,
          },
        }),
      } as never,
      new PromptRegistry(),
      {
        readCategory: async () => [],
        writeDocument: async () => undefined,
      } as never,
      {
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
      } as never,
      profiles,
      policy,
      sessionService,
      new SpawnStore(path.join(dir, "spawn-history.json")),
      {
        getSessionJobsSnapshot: async () => ({
          counts: { queued: 0, preparing: 0, running: 0, completed: 0, failed: 0, active: 0 },
          jobs: [],
        }),
      } as never,
      {
        inspect: async () => ({
          status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null },
          jobs: [],
        }),
      } as never,
      1000,
      600,
    );

    const result = await service.spawn({
      rootSessionId: "root",
      requestId: "req",
      requesterProfileId: "orchestrator",
      profileId: "value_analyst",
      task: "Check valuation",
      rootUserMessage: "Analyze AAPL",
    });

    expect(result.role).toBe("value_analyst");
    expect(result.message).toBe("value summary");
    expect((await service.history("root", "req"))).toHaveLength(1);
    const status = await service.status("root", "req");
    expect(status.specialistCount).toBe(1);
    expect(status.contextUsage.contextWindow).toBe(1000);
    expect(status.contextUsage.contextTokens).toBeGreaterThan(0);
    expect(status.contextUsage.compactionThresholdTokens).toBe(600);
    expect(status.specialists[0]?.usage?.totalTokens).toBe(30);
    expect(status.backtests.active).toBe(0);
    expect(status.crons.total).toBe(0);
  });

  it("rejects unauthorized profile spawning", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-spawn-deny-"));
    const { tools, profiles, registry } = createRegistry();
    const policy = new ToolPolicyService(profiles, registry, tools);
    const sessionService = new SessionService(new AppSessionStore(path.join(dir, "app-sessions.json")));
    await sessionService.createSession({ sessionId: "root", userId: "user", channel: "web" });
    const service = new SessionSpawnService(
      {
        runEphemeral: async () => {
          throw new Error("should not run");
        },
      } as never,
      new PromptRegistry(),
      {
        readCategory: async () => [],
        writeDocument: async () => undefined,
      } as never,
      {
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
      } as never,
      profiles,
      policy,
      sessionService,
      new SpawnStore(path.join(dir, "spawn-history.json")),
      {
        getSessionJobsSnapshot: async () => ({
          counts: { queued: 0, preparing: 0, running: 0, completed: 0, failed: 0, active: 0 },
          jobs: [],
        }),
      } as never,
      {
        inspect: async () => ({
          status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null },
          jobs: [],
        }),
      } as never,
      1000,
      600,
    );

    await expect(
      service.spawn({
        rootSessionId: "root",
        requestId: "req",
        requesterProfileId: "portfolio_agent",
        profileId: "value_analyst",
        task: "Check valuation",
        rootUserMessage: "Analyze AAPL",
      }),
    ).rejects.toThrow("portfolio_agent cannot spawn value_analyst");
  });

  it("clears stale subagent live summaries when clearing a root session", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-spawn-clear-"));
    const { tools, profiles, registry } = createRegistry();
    const policy = new ToolPolicyService(profiles, registry, tools);
    const sessionService = new SessionService(new AppSessionStore(path.join(dir, "app-sessions.json")));
    await sessionService.createSession({ sessionId: "root", userId: "user", channel: "web" });
    const memory = new MemoryService(path.join(dir, "memory"));
    const spawnStore = new SpawnStore(path.join(dir, "spawn-history.json"));
    const service = new SessionSpawnService(
      {
        runEphemeral: async () => ({
          sessionFile: null,
          sessionId: "root:req:value_analyst:1",
          message: "value summary",
          compacted: false,
          toolCalls: [],
          usage: undefined,
        }),
      } as never,
      new PromptRegistry(),
      memory,
      {
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
      } as never,
      profiles,
      policy,
      sessionService,
      spawnStore,
      {
        getSessionJobsSnapshot: async () => ({
          counts: { queued: 0, preparing: 0, running: 0, completed: 0, failed: 0, active: 0 },
          jobs: [],
        }),
      } as never,
      {
        inspect: async () => ({
          status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null },
          jobs: [],
        }),
      } as never,
      1000,
      600,
    );

    await service.spawn({
      rootSessionId: "root",
      requestId: "req",
      requesterProfileId: "orchestrator",
      profileId: "value_analyst",
      task: "Check valuation",
      rootUserMessage: "Analyze AAPL",
    });

    const relativePath = buildLiveSessionSummaryPath("root:req:value_analyst:1");
    const absolutePath = path.join(dir, "memory", relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "# stale spawned summary\n", "utf8");

    await access(absolutePath);
    await service.clear("root");

    await expect(access(absolutePath)).rejects.toThrow();
    expect(await service.history("root")).toHaveLength(0);
  });
});
