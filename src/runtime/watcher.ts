import os from "node:os";
import { mkdir } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

interface RuntimeWatcherParams {
  env: NodeJS.ProcessEnv;
  onConfigChange: (target: "llm" | "mcp", changedPath: string) => Promise<void>;
  onSkillsChange: (changedPath: string) => Promise<void>;
  onPromptsChange: (changedPath: string) => Promise<void>;
}

export class RuntimeWatcher {
  private readonly watchers: FSWatcher[] = [];
  private configTimer: NodeJS.Timeout | null = null;
  private skillsTimer: NodeJS.Timeout | null = null;
  private promptsTimer: NodeJS.Timeout | null = null;

  constructor(private readonly params: RuntimeWatcherParams) {}

  async start(): Promise<void> {
    const configDir = path.resolve("config");
    const skillDirs = resolveSkillWatchRoots(this.params.env);
    const promptDirs = resolvePromptWatchRoots(this.params.env);
    await mkdir(configDir, { recursive: true });
    for (const skillDir of skillDirs) {
      await mkdir(skillDir, { recursive: true });
    }
    for (const promptDir of promptDirs) {
      await mkdir(promptDir, { recursive: true });
    }

    this.watchers.push(
      watch(configDir, { recursive: true }, (_eventType, filename) => {
        const name = filename?.toString().replace(/\\/g, "/") || "";
        if (!name) {
          return;
        }
        const changedPath = path.resolve(configDir, name);
        if (name.endsWith("mcporter.json")) {
          this.debounceConfigReload("mcp", changedPath);
          return;
        }
        if (name.endsWith("llm.local.toml") || name.endsWith("llm.local.json")) {
          this.debounceConfigReload("llm", changedPath);
        }
      }),
    );

    for (const skillDir of skillDirs) {
      this.watchers.push(
        watch(skillDir, { recursive: true }, (_eventType, filename) => {
          const name = filename?.toString().replace(/\\/g, "/") || "";
          const changedPath = name ? path.resolve(skillDir, name) : skillDir;
          this.debounceSkillsReload(changedPath);
        }),
      );
    }

    for (const promptDir of promptDirs) {
      this.watchers.push(
        watch(promptDir, { recursive: true }, (_eventType, filename) => {
          const name = filename?.toString().replace(/\\/g, "/") || "";
          if (!name || !name.endsWith(".md")) {
            return;
          }
          this.debouncePromptsReload(path.resolve(promptDir, name));
        }),
      );
    }
  }

  async close(): Promise<void> {
    if (this.configTimer) {
      clearTimeout(this.configTimer);
      this.configTimer = null;
    }
    if (this.skillsTimer) {
      clearTimeout(this.skillsTimer);
      this.skillsTimer = null;
    }
    if (this.promptsTimer) {
      clearTimeout(this.promptsTimer);
      this.promptsTimer = null;
    }
    for (const watcher of this.watchers.splice(0)) {
      watcher.close();
    }
  }

  private debounceConfigReload(target: "llm" | "mcp", changedPath: string): void {
    if (this.configTimer) {
      clearTimeout(this.configTimer);
    }
    this.configTimer = setTimeout(() => {
      this.configTimer = null;
      void this.params.onConfigChange(target, changedPath);
    }, 300);
  }

  private debounceSkillsReload(changedPath: string): void {
    if (this.skillsTimer) {
      clearTimeout(this.skillsTimer);
    }
    this.skillsTimer = setTimeout(() => {
      this.skillsTimer = null;
      void this.params.onSkillsChange(changedPath);
    }, 300);
  }

  private debouncePromptsReload(changedPath: string): void {
    if (this.promptsTimer) {
      clearTimeout(this.promptsTimer);
    }
    this.promptsTimer = setTimeout(() => {
      this.promptsTimer = null;
      void this.params.onPromptsChange(changedPath);
    }, 300);
  }
}

export function resolveSkillWatchRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = new Set<string>();
  roots.add(path.resolve("skills"));
  const homeDir = resolveHomeDir(env);
  if (homeDir) {
    roots.add(path.resolve(homeDir, ".agents", "skills"));
  }
  return Array.from(roots);
}

export function resolvePromptWatchRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return [path.resolve(env.STOCK_CLAW_PROMPT_ROOT || "prompts")];
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const userProfile = env.USERPROFILE?.trim();
  if (userProfile) {
    return userProfile;
  }
  const home = env.HOME?.trim();
  if (home) {
    return home;
  }
  const homeDrive = env.HOMEDRIVE?.trim();
  const homePath = env.HOMEPATH?.trim();
  if (homeDrive && homePath) {
    return `${homeDrive}${homePath}`;
  }
  return os.homedir();
}
