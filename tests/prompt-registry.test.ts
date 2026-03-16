import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AgentProfileRegistry } from "../src/control/agent-profiles.js";
import { createPromptVariables } from "../src/prompts/dynamic.js";
import { PromptRegistry } from "../src/prompts/registry.js";

describe("PromptRegistry", () => {
  it("composes every agent prompt from the directory convention", async () => {
    const profileRegistry = new AgentProfileRegistry();
    const profiles = profileRegistry.list();
    const registry = new PromptRegistry("prompts", createPromptVariables(profileRegistry));

    for (const profile of profiles) {
      const prompt = await registry.composeAgentPrompt(profile.id);
      expect(prompt.length).toBeGreaterThan(0);
    }
  });

  it("loads workflow prompts from files and directories", async () => {
    const registry = new PromptRegistry("prompts");

    await expect(registry.composeWorkflowPrompt("general_chat")).resolves.toContain("General Chat");
    await expect(registry.composeWorkflowPrompt("memory_flush")).resolves.toContain("pre-compaction");
    await expect(registry.composeWorkflowPrompt("session_compaction_summary")).resolves.toContain(
      "Summarize the entire current session",
    );
    await expect(registry.composeWorkflowPrompt("holding_first_review")).resolves.toContain("Holding-First Review");
    await expect(registry.composeWorkflowPrompt("candidate_deep_analysis")).resolves.toContain("Candidate Deep Analysis");
    await expect(registry.composeWorkflowPrompt("midday_action_mode")).resolves.toContain("Midday Action Mode");
    await expect(registry.composeWorkflowPrompt("eod_attribution")).resolves.toContain("End-of-Day Attribution");
    await expect(registry.composeWorkflowPrompt("weekly_strategy_review")).resolves.toContain("Weekly Strategy Review");
    await expect(registry.composeWorkflowPrompt("monthly_strategy_review")).resolves.toContain("Monthly Strategy Review");
  });

  it("orders shared and agent prompts by filename", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-prompts-"));
    await mkdir(path.join(dir, "shared"), { recursive: true });
    await mkdir(path.join(dir, "agents", "orchestrator"), { recursive: true });
    await writeFile(path.join(dir, "shared", "20_second.md"), "shared-two", "utf8");
    await writeFile(path.join(dir, "shared", "10_first.md"), "shared-one", "utf8");
    await writeFile(path.join(dir, "shared", "06_available_skills.md"), "{{AVAILABLE_SKILLS}}", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "01_agents.md"), "global", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "06_reply_style.md"), "style", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "07_tools.md"), "tools", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "20_second.md"), "agent-two", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "10_first.md"), "agent-one", "utf8");

    const registry = new PromptRegistry(dir, { AVAILABLE_SKILLS: () => "<available_skills>demo</available_skills>" });
    const prompt = await registry.composeAgentPrompt("orchestrator");
    expect(prompt).toBe(
      "<available_skills>demo</available_skills>\n\nshared-one\n\nshared-two\n\nglobal\n\nstyle\n\ntools\n\nagent-one\n\nagent-two",
    );
  });

  it("does not leak orchestrator-only prompt files into other agents", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "stock-claw-prompts-"));
    await mkdir(path.join(dir, "shared"), { recursive: true });
    await mkdir(path.join(dir, "agents", "orchestrator"), { recursive: true });
    await mkdir(path.join(dir, "agents", "value_analyst"), { recursive: true });
    await writeFile(path.join(dir, "agents", "orchestrator", "01_agents.md"), "global", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "06_reply_style.md"), "style", "utf8");
    await writeFile(path.join(dir, "agents", "orchestrator", "07_tools.md"), "tools", "utf8");
    await writeFile(path.join(dir, "shared", "10_first.md"), "shared-one", "utf8");
    await writeFile(path.join(dir, "shared", "06_available_skills.md"), "{{AVAILABLE_SKILLS}}", "utf8");
    await writeFile(path.join(dir, "agents", "value_analyst", "10_first.md"), "agent-one", "utf8");

    const registry = new PromptRegistry(dir, { AVAILABLE_SKILLS: () => "<available_skills>demo</available_skills>" });
    const prompt = await registry.composeAgentPrompt("value_analyst");
    expect(prompt).toBe("<available_skills>demo</available_skills>\n\nshared-one\n\nagent-one");
  });

  it("injects available_skills into all agent prompts from shared scope", async () => {
    const profileRegistry = new AgentProfileRegistry();
    const registry = new PromptRegistry("prompts", createPromptVariables(profileRegistry, { buildPrompt: () => "<available_skills>demo</available_skills>" }));

    for (const profile of profileRegistry.list()) {
      const prompt = await registry.composeAgentPrompt(profile.id);
      expect(prompt).toContain("<available_skills>demo</available_skills>");
    }
  });
});
