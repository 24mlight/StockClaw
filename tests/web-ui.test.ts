import { createServer } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WebApp } from "../src/server/app.js";
import { renderControlPanelClientScript } from "../src/server/ui/client-script.js";
import { CONTROL_PANEL_STYLES } from "../src/server/ui/styles.js";
import { renderControlPanelHtml } from "../src/server/ui.js";

describe("web control panel", () => {
  it("renders the control panel shell", () => {
    const html = renderControlPanelHtml();
    expect(html).toContain("stock-claw Control Panel");
    expect(html).toContain("Session");
    expect(html).toContain("Portfolio");
    expect(html).toContain("/api/sessions");
  });

  it("includes markdown rendering support in the client script", () => {
    const script = renderControlPanelClientScript();
    expect(script).toContain("function renderMarkdown(markdown)");
    expect(script).toContain('class="markdown"');
  });

  it("includes markdown styles for rendered content", () => {
    expect(CONTROL_PANEL_STYLES).toContain(".markdown {");
    expect(CONTROL_PANEL_STYLES).toContain(".code-block {");
  });
});

describe("web app routes", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = "";

  beforeAll(async () => {
    const orchestrator = {
      createSession: async () => ({
        sessionId: "session-1",
        userId: "web-user",
        channel: "web",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastIntent: null,
        transcript: [],
        lastResult: null,
        sessionSummary: null,
        sessionSummaryUpdatedAt: null,
        lastUsage: null,
        cumulativeUsage: {
          turns: 0,
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          contextTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
      getSession: async () => null,
      getSessionSpawns: async () => [
        {
          role: "value_analyst",
          sessionId: "session-1:value",
          message: "spawned",
          toolCalls: [],
        },
      ],
      handle: async () => ({
        intent: "chat",
        response: {
          requestId: "req-1",
          sessionId: "session-1",
          message: "ok",
          blocks: [],
          actions: [],
        },
      }),
      getPortfolioPayload: async () => ({
        snapshot: {
          accountId: "paper",
          mode: "paper",
          cash: 1000,
          equity: 1000,
          buyingPower: 1000,
          positions: [],
          openOrders: [],
          updatedAt: new Date().toISOString(),
        },
        summary: "empty",
      }),
      importPortfolio: async () => ({
        snapshot: {
          accountId: "paper",
          mode: "paper",
          cash: 1000,
          equity: 1000,
          buyingPower: 1000,
          positions: [],
          openOrders: [],
          updatedAt: new Date().toISOString(),
        },
        summary: "empty",
      }),
      executeTrade: async () => ({
        status: "filled",
        mode: "paper",
        symbol: "AAPL",
        side: "buy",
        quantity: 1,
        price: 100,
        message: "filled",
        snapshot: {
          accountId: "paper",
          mode: "paper",
          cash: 900,
          equity: 1000,
          buyingPower: 900,
          positions: [],
          openOrders: [],
          updatedAt: new Date().toISOString(),
        },
      }),
      getConfig: async () => ({ target: "all" }),
      patchConfig: async () => ({ target: "mcp" }),
      installOperation: async () => ({ ok: true }),
      requestRestart: async () => ({
        ok: true,
        action: "restart_runtime",
        message: "stock-claw restart scheduled.",
      }),
      inspectCron: async () => ({
        status: {
          enabled: true,
          jobCount: 1,
          activeJobCount: 1,
          runningJobCount: 0,
          lastTickAt: null,
        },
        jobs: [
          {
            id: "job-1",
            name: "watch-aapl",
            enabled: true,
            state: {
              nextRunAt: "2026-03-08T00:10:00.000Z",
              lastOutcome: "idle",
            },
          },
        ],
      }),
      addCronJob: async () => ({ id: "job-2", name: "review" }),
      updateCronJob: async () => ({ id: "job-2", name: "review-updated" }),
      removeCronJob: async () => ({ ok: true, jobId: "job-2" }),
      runCronJob: async () => ({ jobId: "job-2", status: "succeeded" }),
    };

    const runtime = {
      getOrchestrator: async () => orchestrator,
      getStatus: () => ({
        startedAt: "2026-03-08T00:00:00.000Z",
        lastReloadAt: null,
        lastReloadReason: null,
        reloadCount: 0,
        reloadInFlight: false,
        pendingReason: null,
        lastError: null,
      }),
      inspect: async () => ({
        status: {
          startedAt: "2026-03-08T00:00:00.000Z",
          lastReloadAt: null,
          lastReloadReason: null,
          reloadCount: 0,
          reloadInFlight: false,
          pendingReason: null,
          lastError: null,
        },
        cron: {
          enabled: true,
          jobCount: 1,
          activeJobCount: 1,
          runningJobCount: 0,
          lastTickAt: null,
        },
        skills: [],
        mcp: [{ server: "longport", toolCount: 6 }],
        recentMemory: [],
      }),
      reloadNow: async () => ({
        startedAt: "2026-03-08T00:00:00.000Z",
        lastReloadAt: "2026-03-08T00:01:00.000Z",
        lastReloadReason: "manual",
        reloadCount: 1,
        reloadInFlight: false,
        pendingReason: null,
        lastError: null,
      }),
    };
    const app = new WebApp(runtime as never);
    server = createServer((req, res) => {
      void app.handle(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("serves the control panel at root", async () => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("stock-claw Control Panel");
  });

  it("keeps json health endpoint intact", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      runtime: {
        startedAt: "2026-03-08T00:00:00.000Z",
        lastReloadAt: null,
        lastReloadReason: null,
        reloadCount: 0,
        reloadInFlight: false,
        pendingReason: null,
        lastError: null,
      },
    });
  });

  it("serves spawn history for a session", async () => {
    const response = await fetch(`${baseUrl}/api/sessions/session-1/spawns?requestId=req-1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        role: "value_analyst",
        sessionId: "session-1:value",
        message: "spawned",
        toolCalls: [],
      },
    ]);
  });

  it("serves runtime inspection data", async () => {
    const response = await fetch(`${baseUrl}/api/runtime`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: {
        startedAt: "2026-03-08T00:00:00.000Z",
        lastReloadAt: null,
        lastReloadReason: null,
        reloadCount: 0,
        reloadInFlight: false,
        pendingReason: null,
        lastError: null,
      },
      cron: {
        enabled: true,
        jobCount: 1,
        activeJobCount: 1,
        runningJobCount: 0,
        lastTickAt: null,
      },
      skills: [],
      mcp: [{ server: "longport", toolCount: 6 }],
      recentMemory: [],
    });
  });

  it("serves cron inspection data", async () => {
    const response = await fetch(`${baseUrl}/api/cron`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: {
        enabled: true,
        jobCount: 1,
      },
      jobs: [{ id: "job-1", name: "watch-aapl" }],
    });
  });

  it("schedules a process restart through the runtime API", async () => {
    const response = await fetch(`${baseUrl}/api/runtime/restart`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "web:test",
        note: "stock-claw restarted successfully.",
        reason: "ui-test",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      action: "restart_runtime",
      message: "stock-claw restart scheduled.",
    });
  });
});
