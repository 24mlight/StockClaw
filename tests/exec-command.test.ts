import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { createActionTools } from "../src/tools/action-tools.js";
import { ToolCatalog } from "../src/tools/catalog.js";

function createDeps() {
  const tools = new ToolCatalog();
  const profiles = new AgentProfileRegistry(tools);
  return {
    profiles,
    mcpRuntime: { listTools: () => [] } as never,
    portfolio: {} as never,
    memory: {} as never,
    reviews: {
      savePreopenDecision: async () => "review-artifacts/preopen/2026-03-17.json",
    } as never,
    executor: {} as never,
    backtests: {} as never,
    cron: {} as never,
    config: {} as never,
    ops: {} as never,
    restart: {} as never,
    sessions: {} as never,
    telegram: {} as never,
  };
}

function getExecCommandTool(rootUserMessage?: string) {
  const tools = createActionTools(
    createDeps(),
    {
      sessionKey: "test-session",
      profileId: "system_ops",
      requestId: "req-1",
      rootUserMessage,
    },
    null,
  );
  const execTool = tools.find((tool) => tool.name === "exec_command");
  if (!execTool) {
    throw new Error("exec_command tool not found.");
  }
  return execTool;
}

async function runTool(tool: ReturnType<typeof getExecCommandTool>, params: Record<string, unknown>) {
  return (tool.execute as unknown as (
    id: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: unknown,
  ) => Promise<{ content: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }>)(
    "tool-1",
    params,
  );
}

describe("exec_command", () => {
  it("runs a normal local shell command", async () => {
    const tool = getExecCommandTool("请执行一个普通命令");
    const result = await runTool(tool, {
      command: `node -e "process.stdout.write('ok')"`,
    });
    expect(result.content[0]?.text || "").toContain("ok");
    expect((result as { details?: { mode?: string } }).details?.mode).toBe("shell");
  }, 15000);

  it("blocks destructive commands without explicit confirmation", async () => {
    const tool = getExecCommandTool("帮我看看这个目录");
    await expect(
      runTool(tool, {
        command: process.platform === "win32" ? "Remove-Item temp.txt" : "rm temp.txt",
      }),
    ).rejects.toThrow(/explicit user confirmation/i);
  });

  it("allows destructive commands after explicit confirmation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-exec-"));
    const file = path.join(dir, "temp.txt");
    await writeFile(file, "delete-me", "utf8");
    const command =
      process.platform === "win32"
        ? `Remove-Item '${file}'`
        : `rm '${file.replace(/\\/g, "/")}'`;

    const tool = getExecCommandTool("确认删除这个测试文件");
    await runTool(tool, {
      command,
    });

    await expect(readFile(file, "utf8")).rejects.toThrow();
  }, 15000);
});
