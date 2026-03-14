import { createApplicationRuntime } from "../runtime/factory.js";
import type { ApplicationRuntime } from "../runtime/types.js";
import { RuntimeEventLogger } from "../runtime-logging/logger.js";
import { RuntimeWatcher } from "../runtime/watcher.js";
import type { RuntimeInspectionPayload, RuntimeStatusSnapshot } from "../types.js";
import type { RestartController } from "../restart/controller.js";
import type { TelegramDeliveryTarget } from "../telegram/delivery.js";

interface RuntimeManagerOptions {
  buildRuntime?: () => Promise<ApplicationRuntime>;
  restartController?: RestartController;
  runtimeLogger?: RuntimeEventLogger;
}

export class RuntimeManager {
  private runtime: ApplicationRuntime | null = null;
  private inflight: Promise<ApplicationRuntime> | null = null;
  private reloadQueue: Promise<void> = Promise.resolve();
  private readonly watcher: RuntimeWatcher;
  private readonly buildRuntimeFn: () => Promise<ApplicationRuntime>;
  private reloadTimer: NodeJS.Timeout | null = null;
  private pendingReason = "";
  private pendingFiles: string[] = [];
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private startedAt: string | null = null;
  private lastReloadAt: string | null = null;
  private lastReloadReason: string | null = null;
  private lastError: string | null = null;
  private reloadCount = 0;
  private reloadInFlight = false;
  private readonly restartController?: RestartController;
  private telegram: TelegramDeliveryTarget | null = null;
  private readonly _runtimeLogger: RuntimeEventLogger;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    options: RuntimeManagerOptions = {},
  ) {
    this.restartController = options.restartController;
    this._runtimeLogger = options.runtimeLogger ?? new RuntimeEventLogger(
      env.STOCK_CLAW_RUNTIME_LOG_ROOT || "data/.runtime-logs",
    );
    this.buildRuntimeFn = options.buildRuntime ?? (() => this.buildRuntime());
    this.watcher = new RuntimeWatcher({
      env,
      onConfigChange: async (target, changedPath) => {
        this.scheduleReload(`config:${target}`, changedPath);
      },
      onSkillsChange: async (changedPath) => {
        this.scheduleReload("skills:watch", changedPath);
      },
      onPromptsChange: async (changedPath) => {
        this.scheduleReload("prompts:watch", changedPath);
      },
    });
  }

  async start(): Promise<void> {
    if (this.closed) {
      throw new Error("RuntimeManager is already closed.");
    }
    await this.getRuntime();
    this.startedAt ??= new Date().toISOString();
    await this.watcher.start();
    await this._runtimeLogger.info({
      component: "runtime",
      type: "manager_started",
      data: {
        startedAt: this.startedAt,
      },
    });
  }

  async getRuntime(): Promise<ApplicationRuntime> {
    if (this.closed) {
      throw new Error("RuntimeManager is closed.");
    }
    if (this.runtime) {
      return this.runtime;
    }
    if (!this.inflight) {
      this.inflight = this.buildRuntimeFn();
    }
    try {
      this.runtime = await this.inflight;
      this.runtime.attachTelegram(this.telegram);
      return this.runtime;
    } finally {
      this.inflight = null;
    }
  }

  async getOrchestrator() {
    return (await this.getRuntime()).orchestrator;
  }

  async reloadNow(reason = "manual"): Promise<RuntimeStatusSnapshot> {
    await this.reload(reason);
    return this.getStatus();
  }

  async inspect(limit = 8): Promise<RuntimeInspectionPayload> {
    const runtime = await this.getRuntime();
    const tools = runtime.mcpRuntime.listTools();
    const cron = await runtime.cron.inspect();
    const grouped = new Map<string, number>();
    for (const tool of tools) {
      grouped.set(tool.server, (grouped.get(tool.server) || 0) + 1);
    }
    return {
      status: this.getStatus(),
      cron: {
        ...cron.status,
        jobs: [...cron.jobs]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .slice(0, limit)
          .map((job) => ({
            id: job.id,
            name: job.name,
            enabled: job.enabled,
            updatedAt: job.updatedAt,
            nextRunAt: job.state.nextRunAt,
            lastOutcome: job.state.lastOutcome,
          })),
      },
      skills: runtime.skills.list().map((skill) => ({
        name: skill.name,
        description: skill.description,
        location: skill.filePath,
      })),
      mcp: Array.from(grouped.entries())
        .map(([server, toolCount]) => ({ server, toolCount }))
        .sort((left, right) => left.server.localeCompare(right.server)),
      recentMemory: await runtime.memory.listRecentArtifacts(limit),
    };
  }

  async reload(reason: string, changedFiles: string[] = []): Promise<void> {
    if (this.closed) {
      return;
    }
    this.reloadQueue = this.reloadQueue.then(async () => {
      if (this.closed) {
        return;
      }
      this.reloadInFlight = true;
      try {
        const previous = await this.getRuntime();
        const next = await this.buildRuntimeFn();
        if (this.closed) {
          await next.close();
          return;
        }
        next.attachTelegram(this.telegram);
        this.runtime = next;
        await previous.close();
        this.lastReloadAt = new Date().toISOString();
        this.lastReloadReason = reason;
        this.lastError = null;
        this.reloadCount += 1;
        const fileSummary = formatChangedFiles(changedFiles);
        console.log(
          fileSummary
            ? `🔄 stock-claw runtime reloaded (${reason}) files=${fileSummary}`
            : `🔄 stock-claw runtime reloaded (${reason})`,
        );
        await this._runtimeLogger.info({
          component: "runtime",
          type: "runtime_reloaded",
          data: {
            reason,
            reloadCount: this.reloadCount,
            files: changedFiles.length > 0 ? changedFiles : undefined,
          },
        });
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        await this._runtimeLogger.error({
          component: "runtime",
          type: "runtime_reload_failed",
          data: {
            reason,
            error: this.lastError,
          },
        });
        throw error;
      } finally {
        this.reloadInFlight = false;
      }
    });
    await this.reloadQueue;
  }

  scheduleReload(reason: string, changedPath?: string): void {
    if (this.closed) {
      return;
    }
    this.pendingReason = this.pendingReason ? `${this.pendingReason},${reason}` : reason;
    if (changedPath?.trim()) {
      const normalizedPath = changedPath.trim();
      this.pendingFiles.push(normalizedPath);
      console.log(`👀 stock-claw runtime watch event (${reason}) file=${normalizedPath}`);
      void this._runtimeLogger.info({
        component: "runtime",
        type: "runtime_watch_event",
        data: {
          reason,
          file: normalizedPath,
        },
      });
    }
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = setTimeout(() => {
      const summary = this.pendingReason;
      const files = [...this.pendingFiles];
      this.pendingReason = "";
      this.pendingFiles = [];
      this.reloadTimer = null;
      void this.reload(summary, files).catch((error) => {
        console.warn(`stock-claw runtime reload failed (${summary}): ${String(error)}`);
      });
    }, 300);
  }

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closed = true;
    this.closePromise = this.shutdown();
    return this.closePromise;
  }

  getStatus(): RuntimeStatusSnapshot {
    return {
      startedAt: this.startedAt,
      lastReloadAt: this.lastReloadAt,
      lastReloadReason: this.lastReloadReason,
      reloadCount: this.reloadCount,
      reloadInFlight: this.reloadInFlight,
      pendingReason: this.pendingReason || null,
      lastError: this.lastError,
    };
  }

  attachTelegramExtension(
    telegram: TelegramDeliveryTarget | null,
  ): void {
    this.telegram = telegram;
    this.runtime?.attachTelegram(telegram);
  }

  private async shutdown(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
      this.pendingReason = "";
      this.pendingFiles = [];
    }
    await this.watcher.close();
    await this.reloadQueue.catch(() => {});
    if (this.inflight) {
      try {
        const runtime = await this.inflight;
        if (!this.runtime) {
          this.runtime = runtime;
        }
      } catch {
      } finally {
        this.inflight = null;
      }
    }
    const runtime = this.runtime;
    this.runtime = null;
    if (runtime) {
      await runtime.close();
    }
    await this._runtimeLogger.close();
  }

  private async buildRuntime(): Promise<ApplicationRuntime> {
    return createApplicationRuntime(this.env, {
      afterConfigChange: async (target) => {
        this.scheduleReload(`config:${target}:apply`);
      },
      afterSkillInstall: async () => {
        this.scheduleReload("skills:install");
      },
    }, this.restartController, this._runtimeLogger);
  }

  get runtimeLogger(): RuntimeEventLogger {
    return this._runtimeLogger;
  }
}

function formatChangedFiles(files: string[]): string {
  if (files.length === 0) {
    return "";
  }
  return files.join(", ");
}
