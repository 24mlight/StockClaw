import { AuditLogger } from "../audit/logger.js";
import { ResearchCoordinator } from "../agents/coordinator.js";
import { SessionSpawnService } from "../agents/spawn-service.js";
import { BacktestArtifactService } from "../backtest/artifacts.js";
import { BacktestService } from "../backtest/service.js";
import { BacktestNotifier } from "../backtest/notifier.js";
import { BacktestWorkerLock } from "../backtest/worker-lock.js";
import { ConfigService } from "../config/service.js";
import { loadLlmConfig } from "../config/llm.js";
import { loadMcpServers } from "../config/mcp.js";
import { ControlPlaneGateway } from "../control-plane/gateway.js";
import { AgentProfileRegistry } from "../control/agent-profiles.js";
import { ToolPolicyService } from "../control/tool-policy.js";
import { CronNotifier } from "../cron/notifier.js";
import { CronScheduler } from "../cron/scheduler.js";
import { CronService } from "../cron/service.js";
import { TradeExecutor } from "../execution/executor.js";
import { QuoteResolverService } from "../market/quote-resolver.js";
import { McpRuntime } from "../mcp/runtime.js";
import { MemoryService } from "../memory/service.js";
import { ensureBootstrapMemoryFiles } from "../memory/bootstrap-files.js";
import { Orchestrator } from "../orchestrator.js";
import { OpsService } from "../ops/service.js";
import { PiRuntime } from "../pi/runtime.js";
import { PortfolioStore } from "../portfolio/store.js";
import { ReviewArtifactStore } from "../review/artifact-store.js";
import { PromptRegistry } from "../prompts/registry.js";
import { createPromptVariables } from "../prompts/dynamic.js";
import { RuntimeEventLogger } from "../runtime-logging/logger.js";
import { SessionService } from "../sessions/service.js";
import { SkillRegistry } from "../skills/registry.js";
import { AppSessionStore, BacktestJobStore, BacktestStore, CronStore, SpawnStore } from "../state/index.js";
import { TelegramDeliveryGateway } from "../telegram/delivery.js";
import { ToolCatalog } from "../tools/catalog.js";
import { ToolRegistry } from "../tools/registry.js";
import type { RestartController } from "../restart/controller.js";
import type { ApplicationRuntime, RuntimeHooks } from "./types.js";

export async function createApplicationRuntime(
  env: NodeJS.ProcessEnv,
  hooks: RuntimeHooks = {},
  restart?: RestartController,
  runtimeLogger: RuntimeEventLogger = new RuntimeEventLogger(
    env.STOCK_CLAW_RUNTIME_LOG_ROOT || "data/.runtime-logs",
  ),
): Promise<ApplicationRuntime> {
  const llm = await loadLlmConfig(env);
  const mcpServers = await loadMcpServers(env);
  const mcpRuntime = await McpRuntime.connect(mcpServers, undefined, runtimeLogger);
  const promptRoot = env.STOCK_CLAW_PROMPT_ROOT || "prompts";
  const toolCatalog = new ToolCatalog();
  const profiles = new AgentProfileRegistry(toolCatalog);
  const skills = new SkillRegistry();
  const prompts = new PromptRegistry(promptRoot, createPromptVariables(profiles, skills));
  const memory = new MemoryService(env.STOCK_CLAW_MEMORY_ROOT || "memory");
  await ensureBootstrapMemoryFiles(memory);
  const portfolio = new PortfolioStore(env.STOCK_CLAW_PORTFOLIO_PATH || "data/portfolio.json");
  const reviews = new ReviewArtifactStore(env.STOCK_CLAW_REVIEW_ROOT || "data");
  const sessions = new SessionService(
    new AppSessionStore(env.STOCK_CLAW_APP_SESSION_PATH || "data/app-sessions.json"),
  );
  const audit = new AuditLogger(env.STOCK_CLAW_AUDIT_LOG_PATH || "data/trade_log.jsonl");
  const config = new ConfigService(env, hooks.afterConfigChange);
  const ops = new OpsService(config, process.cwd(), hooks.afterSkillInstall);
  const controlPlane = new ControlPlaneGateway(config, ops, restart);
  const telegramDelivery = new TelegramDeliveryGateway();
  const piRuntime = new PiRuntime(llm, mcpRuntime, skills, process.cwd(), runtimeLogger);
  const quotes = new QuoteResolverService(piRuntime, prompts, () => mcpRuntime.listTools());
  const executor = new TradeExecutor(portfolio, quotes, memory, audit);
  const backtests = new BacktestService(
    new BacktestStore(
      env.STOCK_CLAW_BACKTEST_INDEX_PATH || "data/backtests.json",
      env.STOCK_CLAW_BACKTEST_RUN_ROOT || "data/backtest-runs",
    ),
    new BacktestJobStore(
      env.STOCK_CLAW_BACKTEST_JOB_INDEX_PATH || "data/backtest-jobs.json",
      env.STOCK_CLAW_BACKTEST_JOB_ROOT || "data/backtest-jobs",
    ),
    new BacktestNotifier(sessions, memory, telegramDelivery),
    mcpRuntime,
    piRuntime,
    prompts,
    portfolio,
    sessions,
    {
      artifacts: new BacktestArtifactService(
        env.STOCK_CLAW_BACKTEST_TRACE_ROOT || "data/.backtest-logs",
        env.STOCK_CLAW_BACKTEST_REPORT_ROOT || "data/.backtest-reports",
      ),
      workerLock: new BacktestWorkerLock(
        env.STOCK_CLAW_BACKTEST_WORKER_LOCK_PATH || "data/backtest-worker.lock.json",
      ),
    },
  );
  await backtests.start();
  const cronNotifier = new CronNotifier(sessions);
  const cron = new CronService(
    new CronStore(env.STOCK_CLAW_CRON_STORE_PATH || "data/cron-jobs.json"),
    cronNotifier,
    quotes,
    sessions,
  );
  const restartController =
    restart ??
    ({
      requestRestart: async ({ sessionId, channel, note, reason }) => ({
        ok: false,
        action: "restart_runtime" as const,
        message: "Restart controller is unavailable in this runtime.",
        details: {
          id: "unavailable",
          sessionId,
          channel,
          note,
          reason: reason?.trim() || null,
          requestedAt: new Date().toISOString(),
        },
      }),
    } satisfies Pick<RestartController, "requestRestart"> as RestartController);
  const tools = new ToolRegistry(
    {
      profiles,
      mcpRuntime,
      portfolio,
      memory,
      reviews,
      executor,
      backtests,
      cron,
      config,
      ops,
      restart: restartController,
      sessions,
      telegram: telegramDelivery,
      runtimeLogger,
    },
    toolCatalog,
  );
  const policy = new ToolPolicyService(profiles, tools, toolCatalog);
  const spawnService = new SessionSpawnService(
    piRuntime,
    prompts,
    memory,
    portfolio,
    profiles,
    policy,
    sessions,
    new SpawnStore(env.STOCK_CLAW_SPAWN_STORE_PATH || "data/spawn-history.json"),
    backtests,
    cron,
    llm.chat.contextWindow,
    llm.chat.compactionThresholdTokens,
    runtimeLogger,
  );
  tools.setSessionController(spawnService);
  const coordinator = new ResearchCoordinator(
    piRuntime,
    prompts,
    memory,
    portfolio,
    profiles,
    policy,
    spawnService,
    runtimeLogger,
  );
  const orchestrator = new Orchestrator(
    prompts,
    memory,
    portfolio,
    coordinator,
    executor,
    sessions,
    controlPlane,
    runtimeLogger,
  );
  cron.setRunner({
    run: async (request) => (await orchestrator.handle(request)).response,
  });
  const cronScheduler = new CronScheduler(cron);
  controlPlane.setCronService(cron);
  await cronScheduler.start();
  return {
    orchestrator,
    cron,
    mcpRuntime,
    memory,
    skills,
    runtimeLogger,
    attachTelegram(telegram) {
      cronNotifier.attachTelegram(telegram);
      telegramDelivery.attachTelegram(telegram);
    },
    async close() {
      await cronScheduler.close();
      await backtests.close();
      await mcpRuntime.close();
    },
  };
}
