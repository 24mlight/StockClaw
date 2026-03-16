import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { CronNotifier } from "../src/cron/notifier.js";
import { CronService } from "../src/cron/service.js";
import { CronStore } from "../src/state/cron-store.js";

function resolvedQuote(symbol: string, price: number) {
  return {
    symbol,
    price,
    field: "last",
    timestamp: "2026-03-09T00:00:00.000Z",
    currency: "USD",
    providerType: "mcp",
    providerName: "quotes-mcp",
    toolName: "get_quotes",
    rawEvidence: `last_done=${price}`,
    warnings: [],
    resolutionSessionId: "quote:1",
    resolutionMessage: "resolved",
    resolutionToolCalls: [],
  };
}

describe("CronService", () => {
  it("creates and executes a price alert, then disables it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-service-"));
    const delivered: string[] = [];
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    notifier.attachTelegram({
      sendSystemNotice: async (_sessionId: string, message: string) => {
        delivered.push(message);
      },
    });
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("AAPL.US", 260),
      } as never,
      sessions as never,
      null,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      name: "aapl-alert",
      trigger: { kind: "price", symbol: "AAPL.US", above: 255, checkEveryMs: 5_000 },
      action: { kind: "notify", message: "AAPL crossed 255" },
      target: { sessionId: "telegram:1", channel: "telegram", userId: "telegram:1" },
    });

    const result = await service.runJob(job.id, "manual");
    const saved = await service.getJob(job.id);

    expect(result.status).toBe("succeeded");
    expect(delivered).toEqual(["AAPL crossed 255"]);
    expect(saved?.enabled).toBe(false);
    expect(saved?.state.lastObservedPrice).toBe(260);
  });

  it("normalizes numeric string price thresholds", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-price-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("AAPL.US", 260),
      } as never,
      sessions as never,
      null,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      trigger: {
        kind: "price",
        symbol: "AAPL.US",
        above: "255" as never,
        checkEveryMs: "5000" as never,
      },
      action: { kind: "notify", message: "AAPL crossed 255" },
      target: { sessionId: "web:watch", channel: "web", userId: "web-user" },
    });

    expect(job.trigger.kind).toBe("price");
    if (job.trigger.kind === "price") {
      expect(job.trigger.above).toBe(255);
      expect(job.trigger.checkEveryMs).toBe(5000);
    }
  });

  it("runs scheduled agent turns through the configured runner", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-agent-turn-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const runner = {
      run: vi.fn(async () => ({
        requestId: "cron:req-1",
        sessionId: "web:watch",
        message: "Scheduled review complete.",
        blocks: [],
        actions: [],
      })),
    };
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("AAPL.US", 260),
      } as never,
      sessions as never,
      runner,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      trigger: { kind: "at", at: "2026-03-09T00:00:00.000Z" },
      action: { kind: "agent_turn", message: "Review the portfolio and tell me if risk changed." },
      target: { sessionId: "web:watch", channel: "web", userId: "web-user" },
    });

    const result = await service.runJob(job.id, "manual");

    expect(runner.run).toHaveBeenCalledTimes(1);
    const runnerCalls = runner.run.mock.calls as unknown as Array<[unknown]>;
    const request = runnerCalls[0]![0] as {
      sessionId: string;
      metadata: Record<string, unknown>;
    };
    expect(request.sessionId).not.toBe("web:watch");
    expect(request.sessionId).toMatch(/^cron:/);
    expect(request.metadata.source).toBe("cron");
    expect(request.metadata.automationMode).toBe("scheduled_agent_turn");
    expect(request.metadata.cronTargetSessionId).toBe("web:watch");
    expect(result.status).toBe("succeeded");
    expect(result.response?.message).toBe("Scheduled review complete.");
  });

  it("pushes Telegram notices after scheduled agent turns complete", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-agent-turn-telegram-"));
    const delivered: string[] = [];
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    notifier.attachTelegram({
      sendSystemNotice: async (_sessionId: string, message: string) => {
        delivered.push(message);
      },
    });
    const runner = {
      run: vi.fn(async () => ({
        requestId: "cron:req-telegram",
        sessionId: "telegram:1",
        message: "Scheduled Telegram review complete.",
        blocks: [],
        actions: [],
      })),
    };
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("AAPL.US", 260),
      } as never,
      sessions as never,
      runner,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      trigger: { kind: "at", at: "2026-03-09T00:00:00.000Z" },
      action: { kind: "agent_turn", message: "Review the portfolio and send me the result." },
      target: { sessionId: "telegram:1", channel: "telegram", userId: "telegram:1" },
    });

    const result = await service.runJob(job.id, "schedule");

    expect(result.status).toBe("succeeded");
    expect(delivered).toEqual(["Scheduled Telegram review complete."]);
  });

  it("runs scheduled workflow turns with explicit automation metadata", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-workflow-turn-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const runner = {
      run: vi.fn(async () => ({
        requestId: "cron:req-workflow",
        sessionId: "web:review",
        message: "Midday workflow complete.",
        blocks: [],
        actions: [],
      })),
    };
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("AAPL.US", 260),
      } as never,
      sessions as never,
      runner,
      () => new Date("2026-03-17T12:30:00.000Z"),
    );

    const job = await service.addJob({
      trigger: { kind: "at", at: "2026-03-17T12:30:00.000Z" },
      action: {
        kind: "workflow_turn",
        workflow: "midday_action_mode",
        message: "Review current holdings and produce the afternoon plan.",
      },
      target: { sessionId: "web:review", channel: "web", userId: "web-user" },
    });

    const result = await service.runJob(job.id, "manual");

    expect(runner.run).toHaveBeenCalledTimes(1);
    const runnerCalls = runner.run.mock.calls as unknown as Array<[unknown]>;
    const request = runnerCalls[0]![0] as {
      metadata: Record<string, unknown>;
      message: string;
    };
    expect(request.message).toBe("Review current holdings and produce the afternoon plan.");
    expect(request.metadata.automationMode).toBe("midday_action_mode");
    expect(request.metadata.cronActionKind).toBe("workflow_turn");
    expect(result.response?.message).toBe("Midday workflow complete.");
  });

  it("keeps untriggered price jobs enabled and routes triggered agent turns through the runner", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-price-agent-turn-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const runner = {
      run: vi.fn(async () => ({
        requestId: "cron:req-2",
        sessionId: "telegram:1",
        message: "Executed paper trade plan.",
        blocks: [],
        actions: [],
      })),
    };
    let quote = 520;
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("HCA.US", quote),
      } as never,
      sessions as never,
      runner,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      name: "hca-stop",
      trigger: { kind: "price", symbol: "HCA.US", below: 515, checkEveryMs: 60_000 },
      action: { kind: "agent_turn", message: "Sell the full HCA.US paper position now." },
      target: { sessionId: "telegram:1", channel: "telegram", userId: "telegram:1" },
    });

    const first = await service.runJob(job.id, "schedule");
    const afterFirst = await service.getJob(job.id);
    expect(first.message).toContain("did not trigger");
    expect(afterFirst?.enabled).toBe(true);
    expect(runner.run).toHaveBeenCalledTimes(0);

    quote = 510;
    const second = await service.runJob(job.id, "schedule");
    const afterSecond = await service.getJob(job.id);
    expect(runner.run).toHaveBeenCalledTimes(1);
    const runnerCalls = runner.run.mock.calls as unknown as Array<[unknown]>;
    const request = runnerCalls[0]![0] as {
      sessionId: string;
      metadata: Record<string, unknown>;
    };
    expect(request.sessionId).not.toBe("telegram:1");
    expect(request.sessionId).toMatch(/^cron:/);
    expect(request.metadata.cronTargetSessionId).toBe("telegram:1");
    expect(request.metadata.automationMode).toBe("scheduled_agent_turn");
    expect(second.response?.message).toBe("Executed paper trade plan.");
    expect(afterSecond?.enabled).toBe(false);
  });

  it("converts structured trade automation into an explicit standing instruction for the runner", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-trade-automation-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const runner = {
      run: vi.fn(async () => ({
        requestId: "cron:req-4",
        sessionId: "telegram:1",
        message: "Executed structured trade automation.",
        blocks: [],
        actions: [],
      })),
    };
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("HCA.US", 510),
      } as never,
      sessions as never,
      runner,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      name: "hca-structured-stop",
      trigger: { kind: "price", symbol: "HCA.US", below: 515, checkEveryMs: 60_000 },
      action: {
        kind: "trade_automation",
        symbol: "HCA.US",
        side: "sell",
        quantityMode: "all",
        orderType: "market",
        rationale: "Hard stop loss rule for the full paper position.",
      },
      target: { sessionId: "telegram:1", channel: "telegram", userId: "telegram:1" },
    });

    const result = await service.runJob(job.id, "schedule");

    expect(runner.run).toHaveBeenCalledTimes(1);
    const runnerCalls = runner.run.mock.calls as unknown as Array<[unknown]>;
    const request = runnerCalls[0]![0] as {
      message: string;
      sessionId: string;
      metadata: Record<string, unknown>;
    };
    expect(request.sessionId).toMatch(/^cron:/);
    expect(request.metadata.automationMode).toBe("trade_automation");
    expect(request.metadata.cronTargetSessionId).toBe("telegram:1");
    expect(request.message).toContain("Standing instruction from cron automation.");
    expect(request.message).toContain("Execute a paper sell for HCA.US.");
    expect(request.message).toContain("Latest price: 510.00.");
    expect(result.response?.message).toBe("Executed structured trade automation.");
  });

  it("does not bypass price thresholds during manual runs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-price-manual-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const runner = {
      run: vi.fn(async () => ({
        requestId: "cron:req-3",
        sessionId: "web:watch",
        message: "Should not execute.",
        blocks: [],
        actions: [],
      })),
    };
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("HCA.US", 520),
      } as never,
      sessions as never,
      runner,
      () => new Date("2026-03-09T00:00:00.000Z"),
    );

    const job = await service.addJob({
      name: "manual-price-guard",
      trigger: { kind: "price", symbol: "HCA.US", below: 515, checkEveryMs: 60_000 },
      action: { kind: "agent_turn", message: "Sell HCA.US immediately." },
      target: { sessionId: "web:watch", channel: "web", userId: "web-user" },
    });

    const result = await service.runJob(job.id, "manual");
    const saved = await service.getJob(job.id);

    expect(result.message).toContain("did not trigger");
    expect(runner.run).toHaveBeenCalledTimes(0);
    expect(saved?.enabled).toBe(true);
  });

  it("computes cron nextRunAt using the configured trigger timezone", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-cron-timezone-"));
    const sessions = {
      createSession: vi.fn(async () => undefined),
      appendAssistantResult: vi.fn(async () => undefined),
    };
    const notifier = new CronNotifier(sessions as never);
    const service = new CronService(
      new CronStore(path.join(dir, "cron-jobs.json")),
      notifier,
      {
        resolveQuote: async () => resolvedQuote("AAPL.US", 260),
      } as never,
      sessions as never,
      null,
      () => new Date("2026-03-13T17:05:00.000Z"),
    );

    const job = await service.addJob({
      name: "beijing-hourly-review",
      trigger: { kind: "cron", expr: "52 * * * *", tz: "Asia/Shanghai" },
      action: { kind: "notify", message: "Hourly review" },
      target: { sessionId: "telegram:1", channel: "telegram", userId: "telegram:1" },
    });

    expect(job.state.nextRunAt).toBe("2026-03-13T17:52:00.000Z");
  });
});
