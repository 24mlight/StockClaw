import { randomUUID } from "node:crypto";

import { CronExpressionParser } from "cron-parser";

import type { QuoteResolverService } from "../market/quote-resolver.js";
import { normalizeSymbol } from "../market/symbols.js";
import type { SessionService } from "../sessions/service.js";
import { CronStore } from "../state/cron-store.js";
import type { UserRequest, UserResponsePayload } from "../types.js";
import { CronNotifier } from "./notifier.js";
import type {
  CronAction,
  CronExecutionRecord,
  CronInspectionPayload,
  CronJob,
  CronJobCreateInput,
  CronJobPatch,
  CronStatusSnapshot,
  CronTarget,
  CronTrigger,
} from "./types.js";

export interface CronAgentTurnRunner {
  run(request: UserRequest): Promise<UserResponsePayload>;
}

interface CronExecutionOutcome {
  record: CronExecutionRecord;
  triggered: boolean;
}

export class CronService {
  private enabled = true;
  private readonly runningJobIds = new Set<string>();
  private lastTickAt: string | null = null;
  private runner: CronAgentTurnRunner | null;

  constructor(
    private readonly store: CronStore,
    private readonly notifier: CronNotifier,
    private readonly quotes: QuoteResolverService,
    private readonly sessions: SessionService,
    runner: CronAgentTurnRunner | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.runner = runner;
  }

  setRunner(runner: CronAgentTurnRunner): void {
    this.runner = runner;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getStatus(): CronStatusSnapshot {
    return {
      enabled: this.enabled,
      jobCount: 0,
      activeJobCount: 0,
      runningJobCount: this.runningJobIds.size,
      lastTickAt: this.lastTickAt,
    };
  }

  async inspect(): Promise<CronInspectionPayload> {
    const jobs = await this.store.list();
    return {
      status: {
        enabled: this.enabled,
        jobCount: jobs.length,
        activeJobCount: jobs.filter((job) => job.enabled).length,
        runningJobCount: this.runningJobIds.size,
        lastTickAt: this.lastTickAt,
      },
      jobs,
    };
  }

  async listJobs(): Promise<CronJob[]> {
    return this.store.list();
  }

  async getJob(jobId: string): Promise<CronJob | null> {
    return this.store.get(jobId);
  }

  async addJob(input: CronJobCreateInput): Promise<CronJob> {
    const now = this.now();
    const trigger = normalizeTrigger(input.trigger);
    const action = normalizeAction(input.action);
    const job: CronJob = {
      id: randomUUID(),
      name: input.name?.trim() || defaultJobName(trigger, action),
      enabled: input.enabled ?? true,
      trigger,
      action,
      target: normalizeTarget(input.target),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      state: {
        nextRunAt: computeInitialNextRunAt(trigger, now),
        lastRunAt: null,
        lastOutcome: "idle",
        lastError: null,
        runCount: 0,
        lastObservedPrice: null,
      },
    };
    const jobs = await this.store.list();
    jobs.push(job);
    await this.store.saveAll(jobs);
    return job;
  }

  async updateJob(jobId: string, patch: CronJobPatch): Promise<CronJob> {
    const jobs = await this.store.list();
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index === -1) {
      throw new Error(`Unknown cron job '${jobId}'.`);
    }
    const current = jobs[index]!;
    const nextTrigger = patch.trigger ? normalizeTrigger(patch.trigger) : current.trigger;
    const nextAction = patch.action ? normalizeAction(patch.action) : current.action;
    const nextTarget = patch.target ? normalizeTarget(patch.target) : current.target;
    const now = this.now();
    const next: CronJob = {
      ...current,
      name: patch.name?.trim() || current.name,
      enabled: patch.enabled ?? current.enabled,
      trigger: nextTrigger,
      action: nextAction,
      target: nextTarget,
      updatedAt: now.toISOString(),
      state: {
        ...current.state,
        nextRunAt: computeInitialNextRunAt(nextTrigger, now),
      },
    };
    jobs[index] = next;
    await this.store.saveAll(jobs);
    return next;
  }

  async removeJob(jobId: string): Promise<{ ok: true; jobId: string }> {
    const jobs = await this.store.list();
    const next = jobs.filter((job) => job.id !== jobId);
    await this.store.saveAll(next);
    return { ok: true, jobId };
  }

  async runJob(jobId: string, reason: "manual" | "schedule" = "manual"): Promise<CronExecutionRecord> {
    const jobs = await this.store.list();
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) {
      throw new Error(`Unknown cron job '${jobId}'.`);
    }
    return this.executeJob(job, jobs, reason);
  }

  async runDueJobs(): Promise<CronExecutionRecord[]> {
    if (!this.enabled) {
      return [];
    }
    const jobs = await this.store.list();
    const now = this.now();
    this.lastTickAt = now.toISOString();
    const dueJobs = jobs.filter((job) => this.isDue(job, now));
    const results: CronExecutionRecord[] = [];
    for (const job of dueJobs) {
      results.push(await this.executeJob(job, jobs, "schedule"));
    }
    return results;
  }

  private isDue(job: CronJob, now: Date): boolean {
    if (!job.enabled || this.runningJobIds.has(job.id) || !job.state.nextRunAt) {
      return false;
    }
    return Date.parse(job.state.nextRunAt) <= now.getTime();
  }

  private async executeJob(
    job: CronJob,
    jobs: CronJob[],
    reason: "manual" | "schedule",
  ): Promise<CronExecutionRecord> {
    this.runningJobIds.add(job.id);
    const startedAt = this.now();
    job.state.lastOutcome = "running";
    job.state.lastError = null;
    job.updatedAt = startedAt.toISOString();
    await this.store.saveAll(jobs);

    try {
      const outcome =
        job.trigger.kind === "price"
          ? await this.executePriceJob(job, jobs, startedAt, reason)
          : {
              record: await this.executeTriggeredJob(job, startedAt, reason),
              triggered: true,
            };
      if (!outcome.triggered) {
        return outcome.record;
      }
      finalizeSuccessfulJob(job, startedAt, this.now());
      job.state.nextRunAt = computeNextRunAt(job.trigger, this.now(), job.state.nextRunAt);
      if (job.trigger.kind === "at" || job.trigger.kind === "price") {
        job.enabled = false;
      }
      job.updatedAt = this.now().toISOString();
      await this.store.saveAll(jobs);
      return outcome.record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      job.state.lastOutcome = "failed";
      job.state.lastError = message;
      job.state.lastRunAt = startedAt.toISOString();
      job.state.runCount += 1;
      job.state.nextRunAt = computeNextRunAt(job.trigger, this.now(), job.state.nextRunAt);
      job.updatedAt = this.now().toISOString();
      await this.store.saveAll(jobs);
      return {
        jobId: job.id,
        jobName: job.name,
        triggeredAt: startedAt.toISOString(),
        reason,
        status: "failed",
        message,
      };
    } finally {
      this.runningJobIds.delete(job.id);
    }
  }

  private async executeTriggeredJob(
    job: CronJob,
    startedAt: Date,
    reason: "manual" | "schedule",
  ): Promise<CronExecutionRecord> {
    if (job.action.kind === "notify") {
      const message = job.action.message;
      await this.notifier.deliverNotice({
        sessionId: job.target.sessionId,
        channel: job.target.channel,
        userId: job.target.userId,
        message,
        timestamp: startedAt.toISOString(),
        requestId: `cron:${job.id}:${startedAt.getTime()}`,
      });
      return {
        jobId: job.id,
        jobName: job.name,
        triggeredAt: startedAt.toISOString(),
        reason,
        status: "succeeded",
        message,
      };
    }

    const request = buildCronRequest(job, startedAt, reason, job.action);
    await this.sessions.createSession({
      sessionId: request.sessionId,
      userId: request.userId,
      channel: request.channel,
      now: request.timestamp,
    });
    if (!this.runner) {
      throw new Error("Cron agent runner is not configured.");
    }
    const response = await this.runner.run(request);
    if (job.target.channel === "telegram") {
      await this.notifier.sendChannelNotice({
        sessionId: job.target.sessionId,
        channel: job.target.channel,
        userId: job.target.userId,
        message: response.message,
        timestamp: startedAt.toISOString(),
        requestId: `${request.requestId}:delivery`,
      });
    }
    return {
      jobId: job.id,
      jobName: job.name,
      triggeredAt: startedAt.toISOString(),
      reason,
      status: "succeeded",
      message: response.message,
      response,
    };
  }

  private async executePriceJob(
    job: CronJob,
    jobs: CronJob[],
    startedAt: Date,
    reason: "manual" | "schedule",
  ): Promise<CronExecutionOutcome> {
    if (job.trigger.kind !== "price") {
      throw new Error("Price execution requires a price trigger.");
    }
    const normalizedSymbol = normalizeSymbol(job.trigger.symbol);
    const quote = await this.quotes.resolveQuote({
      sessionId: `cron-price:${job.id}:${startedAt.getTime()}`,
      rootUserMessage: `Resolve the latest live market quote for ${normalizedSymbol} to evaluate cron price-trigger conditions.`,
      symbol: normalizedSymbol,
      purpose: `Evaluate whether cron price trigger '${job.name}' should fire for ${normalizedSymbol}.`,
    });
    const price = quote.price;
    job.state.lastObservedPrice = price;
    const hitAbove = typeof job.trigger.above === "number" && price >= job.trigger.above;
    const hitBelow = typeof job.trigger.below === "number" && price <= job.trigger.below;
    if (!hitAbove && !hitBelow) {
      job.state.lastOutcome = "idle";
      job.state.lastError = null;
      job.state.nextRunAt = computeNextRunAt(job.trigger, this.now(), job.state.nextRunAt);
      job.updatedAt = this.now().toISOString();
      await this.store.saveAll(jobs);
      return {
        triggered: false,
        record: {
          jobId: job.id,
          jobName: job.name,
          triggeredAt: startedAt.toISOString(),
          reason,
          status: "succeeded",
          message: `Price check for ${job.trigger.symbol} did not trigger.`,
        },
      };
    }
    if (
      job.action.kind === "agent_turn" ||
      job.action.kind === "workflow_turn" ||
      job.action.kind === "trade_automation"
    ) {
      const threshold = hitAbove ? job.trigger.above : job.trigger.below;
      const direction = hitAbove ? "above" : "below";
      const request = buildCronRequest(job, startedAt, reason, job.action, {
        symbol: job.trigger.symbol,
        price,
        direction,
        threshold,
      });
      await this.sessions.createSession({
        sessionId: request.sessionId,
        userId: request.userId,
        channel: request.channel,
        now: request.timestamp,
      });
      if (!this.runner) {
        throw new Error("Cron agent runner is not configured.");
      }
      const response = await this.runner.run(request);
      if (job.target.channel === "telegram") {
        await this.notifier.sendChannelNotice({
          sessionId: job.target.sessionId,
          channel: job.target.channel,
          userId: job.target.userId,
          message: response.message,
          timestamp: startedAt.toISOString(),
          requestId: `${request.requestId}:delivery`,
        });
      }
      return {
        triggered: true,
        record: {
          jobId: job.id,
          jobName: job.name,
          triggeredAt: startedAt.toISOString(),
          reason,
          status: "succeeded",
          message: response.message,
          response,
        },
      };
    }
    const threshold = hitAbove ? job.trigger.above : job.trigger.below;
    const direction = hitAbove ? "above" : "below";
    const body =
      job.action.message ||
      `${job.trigger.symbol} traded ${direction} ${threshold}. Latest price: ${price.toFixed(2)}.`;
    await this.notifier.deliverNotice({
      sessionId: job.target.sessionId,
      channel: job.target.channel,
      userId: job.target.userId,
      message: body,
      timestamp: startedAt.toISOString(),
      requestId: `cron:${job.id}:${startedAt.getTime()}`,
    });
    return {
      triggered: true,
      record: {
        jobId: job.id,
        jobName: job.name,
        triggeredAt: startedAt.toISOString(),
        reason,
        status: "succeeded",
        message: body,
      },
    };
  }
}

function normalizeTarget(target: CronTarget): CronTarget {
  return {
    sessionId: target.sessionId.trim(),
    channel: target.channel,
    userId: target.userId.trim(),
  };
}

function normalizeAction(action: CronAction): CronAction {
  if (action.kind === "agent_turn") {
    return {
      kind: "agent_turn",
      message: action.message.trim(),
    };
  }
  if (action.kind === "workflow_turn") {
    return {
      kind: "workflow_turn",
      workflow: action.workflow,
      message: action.message.trim(),
    };
  }
  if (action.kind === "trade_automation") {
    return {
      kind: "trade_automation",
      symbol: action.symbol.trim(),
      side: action.side,
      quantityMode: action.quantityMode,
      quantity: action.quantity ?? null,
      orderType: action.orderType,
      limitPrice: action.limitPrice ?? null,
      rationale: action.rationale.trim(),
    };
  }
  return {
    kind: "notify",
    message: action.message.trim(),
  };
}

function buildCronRequest(
  job: CronJob,
  startedAt: Date,
  reason: "manual" | "schedule",
  action: CronAction,
  triggerContext: {
    symbol?: string | null;
    price?: number | null;
    direction?: "above" | "below" | null;
    threshold?: number | null;
  } = {},
): UserRequest {
  return {
    requestId: `cron:${job.id}:${startedAt.getTime()}`,
    channel: job.target.channel,
    userId: job.target.userId,
    sessionId: buildAutomationSessionId(job, startedAt),
    message: buildAgentTurnMessageForAction(action, triggerContext),
    timestamp: startedAt.toISOString(),
    metadata: {
      source: "cron",
      cronJobId: job.id,
      cronJobName: job.name,
      cronReason: reason,
      cronActionKind: action.kind,
      cronTargetSessionId: job.target.sessionId,
      cronTargetChannel: job.target.channel,
      cronTargetUserId: job.target.userId,
      cronAction: structuredClone(action),
      cronTrigger: structuredClone(job.trigger),
      cronTriggerContext: structuredClone(triggerContext),
      automationMode:
        action.kind === "trade_automation"
          ? "trade_automation"
          : action.kind === "workflow_turn"
            ? action.workflow
            : "scheduled_agent_turn",
    },
  };
}

function buildAutomationSessionId(job: CronJob, startedAt: Date): string {
  return `cron:${job.id}:${startedAt.getTime()}`;
}

function buildAgentTurnMessageForAction(
  action: CronAction,
  triggerContext: {
    symbol?: string | null;
    price?: number | null;
    direction?: "above" | "below" | null;
    threshold?: number | null;
  } = {},
): string {
  if (action.kind === "agent_turn") {
    return action.message;
  }
  if (action.kind === "workflow_turn") {
    return action.message;
  }
  if (action.kind === "trade_automation") {
    const quantityRule =
      action.quantityMode === "all"
        ? "sell or buy the full intended amount"
        : action.quantityMode === "half"
          ? "trade half of the current applicable position or intended allocation"
          : action.quantityMode === "fraction"
            ? `trade ${(action.quantity ?? 0) * 100}% of the current applicable position or intended allocation`
            : `trade exactly ${action.quantity} share(s)`;
    const orderRule =
      action.orderType === "limit"
        ? `Use a limit order at ${action.limitPrice}.`
        : "Use a market order.";
    const triggerNote =
      triggerContext.symbol && triggerContext.price != null
        ? `Trigger context: ${triggerContext.symbol} traded ${triggerContext.direction} ${triggerContext.threshold}. Latest price: ${triggerContext.price.toFixed(2)}.`
        : "";
    return [
      "Standing instruction from cron automation.",
      `This automation was explicitly pre-approved. Immediately route execution through trade_executor and do not ask for confirmation unless required fields are missing or contradictory.`,
      `Execute a paper ${action.side} for ${action.symbol}.`,
      `Quantity rule: ${quantityRule}.`,
      orderRule,
      `Rationale: ${action.rationale}`,
      triggerNote,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return action.message;
}

function normalizeTrigger(trigger: CronTrigger): CronTrigger {
  const raw = trigger as CronTrigger & Record<string, unknown>;
  if (trigger.kind === "at") {
    return { kind: "at", at: new Date(String(raw.at)).toISOString() };
  }
  if (trigger.kind === "every") {
    const everyMs = coercePositiveNumber(raw.everyMs);
    if (everyMs == null) {
      throw new Error("everyMs must be a positive number.");
    }
    return {
      kind: "every",
      everyMs,
      anchorAt: raw.anchorAt ? new Date(String(raw.anchorAt)).toISOString() : null,
    };
  }
  if (trigger.kind === "cron") {
    const expr = String(raw.expr ?? "").trim();
    if (!expr) {
      throw new Error("cron trigger requires a non-empty expr.");
    }
    return {
      kind: "cron",
      expr,
      tz: typeof raw.tz === "string" && raw.tz.trim() ? raw.tz.trim() : null,
    };
  }
  const symbol = String(raw.symbol ?? "").trim();
  const above = coerceNullableNumber(raw.above);
  const below = coerceNullableNumber(raw.below);
  if (!symbol) {
    throw new Error("price trigger requires symbol.");
  }
  if (above == null && below == null) {
    throw new Error("price trigger requires above or below.");
  }
  return {
    kind: "price",
    symbol,
    above,
    below,
    checkEveryMs: coercePositiveNumber(raw.checkEveryMs) ?? 60_000,
  };
}

function defaultJobName(trigger: CronTrigger, action: CronAction): string {
  if (trigger.kind === "price") {
    return `${trigger.symbol.trim()} price alert`;
  }
  if (action.kind === "agent_turn") {
    return "scheduled agent task";
  }
  if (action.kind === "workflow_turn") {
    return `scheduled ${action.workflow}`;
  }
  return "scheduled notification";
}

function computeInitialNextRunAt(trigger: CronTrigger, now: Date): string | null {
  return computeNextRunAt(trigger, now, null);
}

function computeNextRunAt(trigger: CronTrigger, now: Date, previousNextRunAt: string | null): string | null {
  if (trigger.kind === "at") {
    const at = new Date(trigger.at);
    return at.getTime() >= now.getTime() ? at.toISOString() : null;
  }
  if (trigger.kind === "every") {
    const base = trigger.anchorAt ? new Date(trigger.anchorAt).getTime() : now.getTime();
    const current = previousNextRunAt ? new Date(previousNextRunAt).getTime() : base;
    let next = Math.max(base, current);
    while (next <= now.getTime()) {
      next += trigger.everyMs;
    }
    return new Date(next).toISOString();
  }
  if (trigger.kind === "cron") {
    const interval = CronExpressionParser.parse(trigger.expr, {
      currentDate: now,
      tz: trigger.tz || undefined,
    });
    return interval.next().toDate().toISOString();
  }
  return new Date(now.getTime() + (trigger.checkEveryMs ?? 60_000)).toISOString();
}

function finalizeSuccessfulJob(job: CronJob, startedAt: Date, now: Date): void {
  job.state.lastOutcome = "succeeded";
  job.state.lastError = null;
  job.state.lastRunAt = startedAt.toISOString();
  job.state.runCount += 1;
  job.updatedAt = now.toISOString();
}

function coerceNullableNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function coercePositiveNumber(value: unknown): number | null {
  const numeric = coerceNullableNumber(value);
  return numeric != null && numeric > 0 ? Math.floor(numeric) : null;
}
