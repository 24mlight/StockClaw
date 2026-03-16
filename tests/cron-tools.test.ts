import { describe, expect, it, vi } from "vitest";

import { createCronTools } from "../src/tools/cron-tools.js";

describe("cron tool", () => {
  it("accepts flexible price trigger payloads", async () => {
    const addJob = vi.fn(async (input) => ({ id: "job-1", ...input }));
    const tool = createCronTools(
      {
        cron: {
          inspect: vi.fn(async () => ({ status: { enabled: true }, jobs: [] })),
          listJobs: vi.fn(async () => []),
          addJob,
          updateJob: vi.fn(),
          removeJob: vi.fn(),
          runJob: vi.fn(),
        } as never,
      } as never,
      {
        sessionKey: "telegram:6544808656",
      } as never,
    )[0];

    await tool.execute(
      "tool-1",
      {
        action: "add",
        job: {
          name: "AAPL alert",
          trigger: {
            kind: "price",
            ticker: "AAPL.US",
            thresholds: {
              above: "255",
            },
            intervalMs: "30000",
          },
          action: {
            kind: "notify",
            message: "AAPL crossed 255",
          },
        },
      },
      undefined as never,
      undefined as never,
      undefined as never,
    );

    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "AAPL alert",
        trigger: {
          kind: "price",
          symbol: "AAPL.US",
          above: 255,
          below: null,
          checkEveryMs: 30000,
        },
        action: {
          kind: "notify",
          message: "AAPL crossed 255",
        },
        target: {
          sessionId: "telegram:6544808656",
          channel: "telegram",
          userId: "telegram:6544808656",
        },
      }),
    );
  });

  it("parses structured trade_automation actions", async () => {
    const addJob = vi.fn(async (input) => ({ id: "job-2", ...input }));
    const tool = createCronTools(
      {
        cron: {
          inspect: vi.fn(async () => ({ status: { enabled: true }, jobs: [] })),
          listJobs: vi.fn(async () => []),
          addJob,
          updateJob: vi.fn(),
          removeJob: vi.fn(),
          runJob: vi.fn(),
        } as never,
      } as never,
      {
        sessionKey: "telegram:6544808656",
      } as never,
    )[0];

    await tool.execute(
      "tool-2",
      {
        action: "add",
        job: {
          trigger: {
            kind: "price",
            symbol: "HCA.US",
            below: "515",
            checkEveryMs: "60000",
          },
          action: {
            kind: "trade_automation",
            symbol: "HCA.US",
            side: "sell",
            quantityMode: "half",
            orderType: "limit",
            limitPrice: "545",
            rationale: "Take partial profits when the threshold is reached.",
          },
        },
      },
      undefined as never,
      undefined as never,
      undefined as never,
    );

    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: {
          kind: "price",
          symbol: "HCA.US",
          above: null,
          below: 515,
          checkEveryMs: 60000,
        },
        action: {
          kind: "trade_automation",
          symbol: "HCA.US",
          side: "sell",
          quantityMode: "half",
          quantity: null,
          orderType: "limit",
          limitPrice: 545,
          rationale: "Take partial profits when the threshold is reached.",
        },
      }),
    );
  });

  it("defaults cron targets to web for non-telegram sessions", async () => {
    const addJob = vi.fn(async (input) => ({ id: "job-3", ...input }));
    const tool = createCronTools(
      {
        cron: {
          inspect: vi.fn(async () => ({ status: { enabled: true }, jobs: [] })),
          listJobs: vi.fn(async () => []),
          addJob,
          updateJob: vi.fn(),
          removeJob: vi.fn(),
          runJob: vi.fn(),
        } as never,
      } as never,
      {
        sessionKey: "web:watch",
      } as never,
    )[0];

    await tool.execute(
      "tool-3",
      {
        action: "add",
        job: {
          trigger: { kind: "at", at: "2026-03-13T00:00:00.000Z" },
          action: { kind: "notify", message: "scheduled" },
        },
      },
      undefined as never,
      undefined as never,
      undefined as never,
    );

    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          sessionId: "web:watch",
          channel: "web",
          userId: "web-user",
        },
      }),
    );
  });

  it("parses structured workflow_turn actions", async () => {
    const addJob = vi.fn(async (input) => ({ id: "job-4", ...input }));
    const tool = createCronTools(
      {
        cron: {
          inspect: vi.fn(async () => ({ status: { enabled: true }, jobs: [] })),
          listJobs: vi.fn(async () => []),
          addJob,
          updateJob: vi.fn(),
          removeJob: vi.fn(),
          runJob: vi.fn(),
        } as never,
      } as never,
      {
        sessionKey: "web:review",
      } as never,
    )[0];

    await tool.execute(
      "tool-4",
      {
        action: "add",
        job: {
          trigger: { kind: "at", at: "2026-03-17T12:30:00.000Z" },
          action: {
            kind: "workflow_turn",
            workflow: "midday_action_mode",
            message: "Review current holdings and produce the afternoon action plan.",
          },
        },
      },
      undefined as never,
      undefined as never,
      undefined as never,
    );

    expect(addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {
          kind: "workflow_turn",
          workflow: "midday_action_mode",
          message: "Review current holdings and produce the afternoon action plan.",
        },
      }),
    );
  });
});
