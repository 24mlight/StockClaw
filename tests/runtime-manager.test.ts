import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { RuntimeManager } from "../src/runtime/manager.js";
import { RuntimeEventLogger } from "../src/runtime-logging/logger.js";

async function createTestLogger() {
  const root = await mkdtemp(path.join(os.tmpdir(), "stock-claw-runtime-logger-"));
  return new RuntimeEventLogger(root, "runtime.jsonl", false);
}

describe("RuntimeManager", () => {
  it("replaces the active runtime on reload and closes the previous one", async () => {
    const closeFirst = vi.fn(async () => {});
    const closeSecond = vi.fn(async () => {});
    const builder = vi
      .fn()
      .mockResolvedValueOnce({
        orchestrator: { id: "first" },
        mcpRuntime: { close: closeFirst },
        attachTelegram: () => undefined,
        close: closeFirst,
      })
      .mockResolvedValueOnce({
        orchestrator: { id: "second" },
        mcpRuntime: { close: closeSecond },
        attachTelegram: () => undefined,
        close: closeSecond,
      });

    const manager = new RuntimeManager({}, { buildRuntime: builder, runtimeLogger: await createTestLogger() });
    const first = await manager.getRuntime();
    expect(first.orchestrator).toEqual({ id: "first" });

    await manager.reload("test");

    const current = await manager.getRuntime();
    expect(current.orchestrator).toEqual({ id: "second" });
    expect(closeFirst).toHaveBeenCalledTimes(1);

    await manager.close();
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });

  it("does not leave a rebuilt runtime open when close races with a scheduled reload", async () => {
    const closeFirst = vi.fn(async () => {});
    const closeSecond = vi.fn(async () => {});
    const builder = vi
      .fn()
      .mockResolvedValueOnce({
        orchestrator: { id: "first" },
        mcpRuntime: { close: closeFirst },
        attachTelegram: () => undefined,
        close: closeFirst,
      })
      .mockResolvedValueOnce({
        orchestrator: { id: "second" },
        mcpRuntime: { close: closeSecond },
        attachTelegram: () => undefined,
        close: closeSecond,
      });

    const manager = new RuntimeManager({}, { buildRuntime: builder, runtimeLogger: await createTestLogger() });
    await manager.start();
    manager.scheduleReload("skills:install");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await manager.close();

    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });

  it("reports reload status after a manual reload", async () => {
    const closeFirst = vi.fn(async () => {});
    const closeSecond = vi.fn(async () => {});
    const builder = vi
      .fn()
      .mockResolvedValueOnce({
        orchestrator: { id: "first" },
        mcpRuntime: { close: closeFirst, listTools: () => [] },
        cron: { inspect: async () => ({ status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null }, jobs: [] }) },
        memory: { listRecentArtifacts: async () => [] },
        skills: { list: () => [] },
        attachTelegram: () => undefined,
        close: closeFirst,
      })
      .mockResolvedValueOnce({
        orchestrator: { id: "second" },
        mcpRuntime: { close: closeSecond, listTools: () => [] },
        cron: { inspect: async () => ({ status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null }, jobs: [] }) },
        memory: { listRecentArtifacts: async () => [] },
        skills: { list: () => [] },
        attachTelegram: () => undefined,
        close: closeSecond,
      });

    const manager = new RuntimeManager({}, { buildRuntime: builder, runtimeLogger: await createTestLogger() });
    await manager.start();
    const status = await manager.reloadNow("manual-test");

    expect(status.reloadCount).toBe(1);
    expect(status.lastReloadReason).toBe("manual-test");
    expect(status.lastReloadAt).toBeTruthy();
    await manager.close();
  });

  it("records prompt-watch reloads", async () => {
    const closeFirst = vi.fn(async () => {});
    const closeSecond = vi.fn(async () => {});
    const builder = vi
      .fn()
      .mockResolvedValueOnce({
        orchestrator: { id: "first" },
        mcpRuntime: { close: closeFirst, listTools: () => [] },
        cron: { inspect: async () => ({ status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null }, jobs: [] }) },
        memory: { listRecentArtifacts: async () => [] },
        skills: { list: () => [] },
        attachTelegram: () => undefined,
        close: closeFirst,
      })
      .mockResolvedValueOnce({
        orchestrator: { id: "second" },
        mcpRuntime: { close: closeSecond, listTools: () => [] },
        cron: { inspect: async () => ({ status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null }, jobs: [] }) },
        memory: { listRecentArtifacts: async () => [] },
        skills: { list: () => [] },
        attachTelegram: () => undefined,
        close: closeSecond,
      });

    const manager = new RuntimeManager({}, { buildRuntime: builder, runtimeLogger: await createTestLogger() });
    await manager.start();
    manager.scheduleReload("prompts:watch");
    await new Promise((resolve) => setTimeout(resolve, 350));

    const status = manager.getStatus();
    expect(status.reloadCount).toBe(1);
    expect(status.lastReloadReason).toBe("prompts:watch");
    await manager.close();
  });

  it("records changed file paths immediately and includes all files in the reload log", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "stock-claw-runtime-logger-"));
    const logger = new RuntimeEventLogger(root, "runtime.jsonl", false);
    const closeFirst = vi.fn(async () => {});
    const closeSecond = vi.fn(async () => {});
    const builder = vi
      .fn()
      .mockResolvedValueOnce({
        orchestrator: { id: "first" },
        mcpRuntime: { close: closeFirst, listTools: () => [] },
        cron: { inspect: async () => ({ status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null }, jobs: [] }) },
        memory: { listRecentArtifacts: async () => [] },
        skills: { list: () => [] },
        attachTelegram: () => undefined,
        close: closeFirst,
      })
      .mockResolvedValueOnce({
        orchestrator: { id: "second" },
        mcpRuntime: { close: closeSecond, listTools: () => [] },
        cron: { inspect: async () => ({ status: { enabled: true, jobCount: 0, activeJobCount: 0, runningJobCount: 0, lastTickAt: null }, jobs: [] }) },
        memory: { listRecentArtifacts: async () => [] },
        skills: { list: () => [] },
        attachTelegram: () => undefined,
        close: closeSecond,
      });

    const manager = new RuntimeManager({}, { buildRuntime: builder, runtimeLogger: logger });
    await manager.start();
    manager.scheduleReload("prompts:watch", path.resolve("prompts/test-a.md"));
    manager.scheduleReload("skills:watch", path.resolve("skills/test-b/SKILL.md"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await manager.close();

    const raw = await readFile(path.join(root, "runtime.jsonl"), "utf8");
    expect(raw).toContain("\"type\":\"runtime_watch_event\"");
    expect(raw).toContain("\"type\":\"runtime_reloaded\"");
    expect(raw).toContain(path.resolve("prompts/test-a.md").replaceAll("\\", "\\\\"));
    expect(raw).toContain(path.resolve("skills/test-b/SKILL.md").replaceAll("\\", "\\\\"));
  });
});
