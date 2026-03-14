import { describe, expect, it } from "vitest";

import { buildStatusMessage } from "../src/status/message.js";

describe("buildStatusMessage", () => {
  it("distinguishes live session summary from durable memory artifacts", () => {
    const message = buildStatusMessage({
      session: {
        sessionId: "web:session-1",
        requestId: null,
        lastIntent: "investment_research",
        transcriptEntries: 4,
        sessionSummary: "User prefers low drawdown.",
        updatedAt: "2026-03-12T00:00:00.000Z",
        contextUsage: {
          contextTokens: 100,
          source: "estimate",
          contextWindow: 128000,
          remainingTokens: 127900,
          percentUsed: 1,
          compactionThresholdTokens: 76800,
        },
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
        specialistCount: 0,
        specialists: [],
        backtests: {
          queued: 0,
          preparing: 0,
          running: 0,
          completed: 0,
          failed: 0,
          active: 0,
          jobs: [],
        },
        crons: {
          total: 0,
          active: 0,
          running: 0,
          jobs: [],
        },
      },
      runtime: {
        status: {
          startedAt: "2026-03-12T00:00:00.000Z",
          lastReloadAt: null,
          lastReloadReason: null,
          reloadCount: 0,
          reloadInFlight: false,
          pendingReason: null,
          lastError: null,
        },
        cron: {
          enabled: true,
          jobCount: 0,
          activeJobCount: 0,
          runningJobCount: 0,
          lastTickAt: null,
          jobs: [],
        },
        skills: [],
        mcp: [],
        recentMemory: [
          {
            path: "memory/non-investment/TOOLS.md",
            fileName: "TOOLS.md",
            category: "bootstrap",
            updatedAt: "2026-03-12T00:01:00.000Z",
            excerpt: "",
          },
          {
            path: "memory/2026-03-12.md",
            fileName: "2026-03-12.md",
            category: "daily",
            updatedAt: "2026-03-12T00:02:00.000Z",
            excerpt: "",
          },
        ],
      },
    });

    expect(message).toContain("📝 Live Session Summary:");
    expect(message).toContain("🗂️ Recent Durable Memory Artifacts:");
    expect(message).toContain("TOOLS.md [bootstrap memory]");
    expect(message).toContain("2026-03-12.md [daily flush]");
  });

  it("does not duplicate the live session summary heading when the stored summary is markdown", () => {
    const message = buildStatusMessage({
      session: {
        sessionId: "web:session-1",
        requestId: null,
        lastIntent: "investment_research",
        transcriptEntries: 4,
        sessionSummary: [
          "# Live Session Summary",
          "",
          "## Durable User Preferences",
          "",
          "- Prefer low drawdown.",
        ].join("\n"),
        updatedAt: "2026-03-12T00:00:00.000Z",
        contextUsage: {
          contextTokens: 100,
          source: "estimate",
          contextWindow: 128000,
          remainingTokens: 127900,
          percentUsed: 1,
          compactionThresholdTokens: 76800,
        },
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
        specialistCount: 0,
        specialists: [],
        backtests: {
          queued: 0,
          preparing: 0,
          running: 0,
          completed: 0,
          failed: 0,
          active: 0,
          jobs: [],
        },
        crons: {
          total: 0,
          active: 0,
          running: 0,
          jobs: [],
        },
      },
      runtime: null,
    });

    expect(message).toContain("📝 Live Session Summary:");
    expect(message).toContain("## Durable User Preferences");
    expect(message).not.toContain("Live Session Summary\nLive Session Summary");
    expect(message).not.toContain("# Live Session Summary");
  });

  it("shows only the latest backtest job in status output and points to /backtests", () => {
    const message = buildStatusMessage({
      session: {
        sessionId: "telegram:200",
        requestId: null,
        lastIntent: "investment_research",
        transcriptEntries: 7,
        sessionSummary: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        contextUsage: {
          contextTokens: 100,
          source: "estimate",
          contextWindow: 128000,
          remainingTokens: 127900,
          percentUsed: 1,
          compactionThresholdTokens: 76800,
        },
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
        specialistCount: 0,
        specialists: [],
        backtests: {
          queued: 0,
          preparing: 0,
          running: 1,
          completed: 1,
          failed: 0,
          active: 1,
          jobs: [
            {
              jobId: "job-new",
              status: "running",
              kind: "portfolio",
              symbols: ["MSFT.US"],
              dateFrom: "2026-03-03",
              dateTo: "2026-03-11",
              runId: "run-new",
              datasetId: "dataset-new",
              submittedAt: "2026-03-12T02:00:00.000Z",
              startedAt: "2026-03-12T02:01:00.000Z",
              completedAt: null,
              deliveredAt: null,
              reportSummary: null,
              error: null,
            },
            {
              jobId: "job-old",
              status: "completed",
              kind: "asset",
              symbols: ["AAPL.US"],
              dateFrom: "2026-03-01",
              dateTo: "2026-03-07",
              runId: "run-old",
              datasetId: "dataset-old",
              submittedAt: "2026-03-11T02:00:00.000Z",
              startedAt: "2026-03-11T02:01:00.000Z",
              completedAt: "2026-03-11T02:05:00.000Z",
              deliveredAt: "2026-03-11T02:06:00.000Z",
              reportSummary: "Return 1.20%",
              error: null,
            },
          ],
        },
        crons: {
          total: 0,
          active: 0,
          running: 0,
          jobs: [],
        },
      },
      runtime: null,
    });

    expect(message).toContain("🧪 Recent Backtest Jobs:");
    expect(message).toContain("job-new");
    expect(message).not.toContain("job-old");
    expect(message).toContain("Full Backtest History: /backtests");
  });

  it("shows the latest cron job and points to /cron when the session has cron jobs", () => {
    const message = buildStatusMessage({
      session: {
        sessionId: "telegram:200",
        requestId: null,
        lastIntent: "investment_research",
        transcriptEntries: 7,
        sessionSummary: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        contextUsage: {
          contextTokens: 100,
          source: "estimate",
          contextWindow: 128000,
          remainingTokens: 127900,
          percentUsed: 1,
          compactionThresholdTokens: 76800,
        },
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
        specialistCount: 0,
        specialists: [],
        backtests: {
          queued: 0,
          preparing: 0,
          running: 0,
          completed: 0,
          failed: 0,
          active: 0,
          jobs: [],
        },
        crons: {
          total: 2,
          active: 1,
          running: 0,
          jobs: [
            {
              jobId: "cron-new",
              name: "hourly rebalance",
              enabled: true,
              updatedAt: "2026-03-12T00:31:00.000Z",
              nextRunAt: "2026-03-12T01:30:00.000Z",
              lastOutcome: "succeeded",
            },
          ],
        },
      },
      runtime: {
        status: {
          startedAt: "2026-03-12T00:00:00.000Z",
          lastReloadAt: null,
          lastReloadReason: null,
          reloadCount: 0,
          reloadInFlight: false,
          pendingReason: null,
          lastError: null,
        },
        cron: {
          enabled: true,
          jobCount: 2,
          activeJobCount: 1,
          runningJobCount: 0,
          lastTickAt: "2026-03-12T00:30:00.000Z",
          jobs: [],
        },
        skills: [],
        mcp: [],
        recentMemory: [],
      },
    });

    expect(message).toContain("⏰ Cron Jobs:");
    expect(message).toContain("🕒 Latest Cron Job:");
    expect(message).toContain("hourly rebalance (cron-new)");
    expect(message).toContain("Full Cron History: /cron");
  });
});
