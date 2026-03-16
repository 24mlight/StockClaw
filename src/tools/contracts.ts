import type { ConfigService } from "../config/service.js";
import type { AgentProfileRegistry } from "../control/agent-profiles.js";
import type { CronService } from "../cron/service.js";
import type { BacktestService } from "../backtest/service.js";
import type { TradeExecutor } from "../execution/executor.js";
import type { McpRuntime } from "../mcp/runtime.js";
import type { MemoryService } from "../memory/service.js";
import type { OpsService } from "../ops/service.js";
import type { PortfolioStore } from "../portfolio/store.js";
import type { ReviewArtifactStore } from "../review/artifact-store.js";
import type { RestartController } from "../restart/controller.js";
import type { RuntimeEventLogger } from "../runtime-logging/logger.js";
import type { SessionService } from "../sessions/service.js";
import type { TelegramDeliveryGateway } from "../telegram/delivery.js";
import type {
  AgentProfileId,
  SessionSpawnRequest,
  SessionStatusPayload,
  SpecialistResult,
} from "../types.js";

export type ToolRegistryDeps = {
  profiles: AgentProfileRegistry;
  mcpRuntime: McpRuntime;
  portfolio: PortfolioStore;
  memory: MemoryService;
  reviews: ReviewArtifactStore;
  executor: TradeExecutor;
  backtests: BacktestService;
  cron: CronService;
  config: ConfigService;
  ops: OpsService;
  restart: RestartController;
  sessions: SessionService;
  telegram: TelegramDeliveryGateway;
  runtimeLogger?: RuntimeEventLogger | null;
};

export interface ToolExecutionContext {
  sessionKey: string;
  profileId: AgentProfileId;
  requestId?: string;
  rootUserMessage?: string;
  requestMetadata?: Record<string, unknown>;
}

export interface SessionToolController {
  spawn(request: SessionSpawnRequest): Promise<SpecialistResult>;
  list(rootSessionId: string): Promise<SpecialistResult[]>;
  history(rootSessionId: string, requestId?: string): Promise<SpecialistResult[]>;
  status(rootSessionId: string, requestId?: string): Promise<SessionStatusPayload>;
}
