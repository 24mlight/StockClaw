import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  EodAttributionReport,
  MiddayActionAdvice,
  PortfolioDailySnapshot,
  PreopenDecisionBundle,
  StrategyReviewReport,
} from "../types.js";

export class ReviewArtifactStore {
  constructor(private readonly rootDir: string = "data") {}

  async savePreopenDecision(bundle: PreopenDecisionBundle): Promise<string> {
    return this.writeJson(
      path.join("review-artifacts", "preopen", `${normalizeDateKey(bundle.date)}.json`),
      bundle,
    );
  }

  async savePortfolioDailySnapshot(snapshot: PortfolioDailySnapshot): Promise<string> {
    return this.writeJson(
      path.join("portfolio-snapshots", `${normalizeDateKey(snapshot.date)}.json`),
      snapshot,
    );
  }

  async saveMiddayActionAdvice(advice: MiddayActionAdvice): Promise<string> {
    return this.writeJson(
      path.join("review-artifacts", "midday", `${normalizeDateKey(advice.date)}.json`),
      advice,
    );
  }

  async saveEodAttribution(report: EodAttributionReport): Promise<string> {
    return this.writeJson(
      path.join("review-artifacts", "eod", `${normalizeDateKey(report.date)}.json`),
      report,
    );
  }

  async saveStrategyReview(report: StrategyReviewReport): Promise<string> {
    return this.writeJson(
      path.join(
        "review-artifacts",
        report.period,
        `${normalizeDateKey(report.periodStart)}_${normalizeDateKey(report.periodEnd)}.json`,
      ),
      report,
    );
  }

  private async writeJson(relativePath: string, data: unknown): Promise<string> {
    const normalized = relativePath.replaceAll("\\", "/");
    const targetPath = path.resolve(this.rootDir, normalized);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    return normalized;
  }
}

function normalizeDateKey(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return assertValidDateKey(trimmed, value);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid artifact date '${value}'.`);
  }
  return assertValidDateKey(parsed.toISOString().slice(0, 10), value);
}

function assertValidDateKey(dateKey: string, originalValue: string): string {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey) {
    throw new Error(`Invalid artifact date '${originalValue}'.`);
  }
  return dateKey;
}
