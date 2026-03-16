import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ReviewArtifactStore } from "../src/review/artifact-store.js";

describe("ReviewArtifactStore", () => {
  it("stores preopen decision bundles under dated preopen artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-review-artifacts-"));
    const store = new ReviewArtifactStore(dir);

    const relativePath = await store.savePreopenDecision({
      date: "2026-03-17",
      createdAt: "2026-03-17T08:45:00.000Z",
      capitalAllocationGate: {
        asOf: "2026-03-17T08:30:00.000Z",
        allowNewPositions: false,
        posture: "defensive",
        maxNewRiskBudget: 0,
        rationale: "Existing positions already consume the allowed risk budget.",
        constraints: ["No new positions until NVDA risk is reduced."],
      },
      holdingActionPlan: {
        asOf: "2026-03-17T08:40:00.000Z",
        summary: "Reduce extended winners and keep cash ready.",
        items: [
          {
            symbol: "NVDA.US",
            action: "reduce",
            confidence: 0.82,
            rationale: "Momentum remains strong but size is too large for the current gate.",
            riskNotes: ["Gap risk into earnings"],
            suggestedPositionChange: "-25%",
            invalidation: "Re-add only if market breadth improves.",
          },
        ],
      },
      tradePlan: {
        date: "2026-03-17",
        createdAt: "2026-03-17T08:45:00.000Z",
        blockedSymbols: ["PLTR.US"],
        entries: [],
      },
    });

    expect(relativePath).toBe("review-artifacts/preopen/2026-03-17.json");
    const saved = JSON.parse(await readFile(path.join(dir, relativePath), "utf8")) as {
      capitalAllocationGate: { allowNewPositions: boolean };
      holdingActionPlan: { items: Array<{ symbol: string }> };
      tradePlan: { blockedSymbols: string[] };
    };
    expect(saved.capitalAllocationGate.allowNewPositions).toBe(false);
    expect(saved.holdingActionPlan.items[0]?.symbol).toBe("NVDA.US");
    expect(saved.tradePlan.blockedSymbols).toEqual(["PLTR.US"]);
  });

  it("stores portfolio daily snapshots and end-of-day attribution in dedicated daily locations", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-review-artifacts-"));
    const store = new ReviewArtifactStore(dir);

    const middayPath = await store.saveMiddayActionAdvice({
      date: "2026-03-17",
      createdAt: "2026-03-17T12:30:00.000Z",
      exposureDirective: "shrink",
      holdings: ["Trim NVDA.US into strength."],
      candidates: ["Do not add new names unless breadth improves."],
      doNotTrade: ["Avoid low-liquidity momentum names this afternoon."],
    });
    const snapshotPath = await store.savePortfolioDailySnapshot({
      date: "2026-03-17",
      capturedAt: "2026-03-17T16:00:00.000Z",
      accountId: "paper",
      mode: "paper",
      cash: 25000,
      equity: 103000,
      buyingPower: 25000,
      positions: [],
      openOrders: [],
    });
    const eodPath = await store.saveEodAttribution({
      date: "2026-03-17",
      createdAt: "2026-03-17T16:15:00.000Z",
      selection: "Good stock selection overall, but late entries reduced edge.",
      execution: "Two fills chased price and worsened entry quality.",
      sizing: "Gross exposure stayed too high after the open.",
      discipline: "One stop discipline breach on a weak reopen.",
      lessons: ["Cut size faster when the capital gate tightens intraday."],
      symbolAttributions: [
        {
          symbol: "TSLA.US",
          outcome: "negative",
          attribution: "Late add into extension with weak follow-through.",
        },
      ],
    });

    expect(middayPath).toBe("review-artifacts/midday/2026-03-17.json");
    expect(snapshotPath).toBe("portfolio-snapshots/2026-03-17.json");
    expect(eodPath).toBe("review-artifacts/eod/2026-03-17.json");

    const savedSnapshot = JSON.parse(await readFile(path.join(dir, snapshotPath), "utf8")) as {
      accountId: string;
      equity: number;
    };
    const savedEod = JSON.parse(await readFile(path.join(dir, eodPath), "utf8")) as {
      symbolAttributions: Array<{ symbol: string }>;
    };
    expect(savedSnapshot.accountId).toBe("paper");
    expect(savedSnapshot.equity).toBe(103000);
    expect(savedEod.symbolAttributions[0]?.symbol).toBe("TSLA.US");
  });

  it("stores weekly and monthly reviews in separate strategy review directories", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-review-artifacts-"));
    const store = new ReviewArtifactStore(dir);

    const weeklyPath = await store.saveStrategyReview({
      period: "weekly",
      periodStart: "2026-03-10",
      periodEnd: "2026-03-14",
      createdAt: "2026-03-14T18:00:00.000Z",
      keptRules: ["Only add when breadth confirms."],
      droppedRules: ["Do not fade first green candles blindly."],
      favoredConditions: ["Broad tech leadership"],
      adverseConditions: ["Index-led chop"],
      lessons: ["Stay patient when opening ranges expand."],
    });
    const monthlyPath = await store.saveStrategyReview({
      period: "monthly",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      createdAt: "2026-03-31T20:00:00.000Z",
      keptRules: ["Scale only into strength."],
      droppedRules: ["No averaging down on broken leaders."],
      favoredConditions: ["Trend persistence after macro relief"],
      adverseConditions: ["Gap-and-fade index opens"],
      lessons: ["Need a harder cap on correlated exposure."],
    });

    expect(weeklyPath).toBe("review-artifacts/weekly/2026-03-10_2026-03-14.json");
    expect(monthlyPath).toBe("review-artifacts/monthly/2026-03-01_2026-03-31.json");
  });

  it("rejects invalid calendar dates before writing artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-review-artifacts-"));
    const store = new ReviewArtifactStore(dir);

    await expect(
      store.saveEodAttribution({
        date: "2026-02-31",
        createdAt: "2026-02-31T16:15:00.000Z",
        selection: "n/a",
        execution: "n/a",
        sizing: "n/a",
        discipline: "n/a",
        lessons: [],
        symbolAttributions: [],
      }),
    ).rejects.toThrow(/invalid artifact date/i);
  });

  it("rejects malformed date strings with valid-looking prefixes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-review-artifacts-"));
    const store = new ReviewArtifactStore(dir);

    await expect(
      store.savePreopenDecision({
        date: "2026-03-17oops",
        createdAt: "2026-03-17T08:45:00.000Z",
        capitalAllocationGate: {
          asOf: "2026-03-17T08:30:00.000Z",
          allowNewPositions: true,
          posture: "neutral",
          maxNewRiskBudget: 1,
          rationale: "ok",
          constraints: [],
        },
        holdingActionPlan: {
          asOf: "2026-03-17T08:40:00.000Z",
          summary: "ok",
          items: [],
        },
        tradePlan: null,
      }),
    ).rejects.toThrow(/invalid artifact date/i);
  });
});
