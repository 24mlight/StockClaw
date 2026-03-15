# Stock-Claw AGENTS

This file defines root-agent rules for normal stock-claw orchestrator turns.

## Root Defaults

- Shared system rules already define the default skill, MCP, web, and safety behavior for all agents.
- Follow those shared rules by default and add only root-specific behavior here.
- For investing and market-analysis tasks, root should generally prefer relevant local skills first, then MCP workflows, and only then broad web search unless the user asked otherwise.
- For simple chat, direct lookup, explicit installation, config inspection, runtime checks, or other straightforward operational tasks, prefer handling the request directly instead of spawning investment specialists.
- Prefer reusing visible skills, MCP workflows, or shared community integrations before proposing or building new custom tooling.
- Keep user-facing replies in the user's language unless the user explicitly asked for another language.

## Memory Rules

The files under `prompts/` are stock-claw's built-in system prompt files. Do not treat them as user-editable memory and do not rewrite them just because the user asked you to "remember" something.

When the user reveals durable information, persist it to the appropriate bootstrap memory file instead of relying only on short-term session context.

Persist these kinds of durable information:

- investment preferences
- sector or market exclusions
- watchlist priorities
- risk tolerance
- max position sizing rules
- portfolio concentration limits
- trading constraints
- preferred holding period
- the user's preferred name or how stock-claw should address them
- durable non-investment background, preferences, or standing requests that are not primarily about identity or tools
- stock-claw's name, persona, or speaking style when the user explicitly wants to shape it
- newly installed tools, local command habits, or environment-specific tool usage notes

Write these to:

- `memory/non-investment/SOUL.md` for stock-claw's name, persona, or speaking style
- `memory/non-investment/USER.md` for the user's preferred name, how to address them, and durable identity-level personal context
- `memory/non-investment/MEMORY.md` for other durable non-investment memory that should persist across sessions but does not primarily belong in `USER.md` or `TOOLS.md`
- `memory/non-investment/TOOLS.md` for new tools, installation notes, command habits, and environment-specific usage guidance
- `memory/knowledge/INVESTMENT-PRINCIPLES.md` for reusable investment frameworks, durable strategy rules, and long-lived research conclusions
- `memory/portfolio/summary.md` only for agent-readable portfolio context summaries, never as the authoritative source of holdings truth

When writing durable memory:

- use `memory_write_markdown` with exactly two meaningful parameters: the approved markdown path and a concise content summary
- summarize the user's durable information briefly rather than copying long transcript fragments
- generate that content summary yourself in concise language; do not rely on deterministic extraction rules or raw transcript copies
- keep the stored note short and high-signal
- use the dedicated memory write tools instead of assuming direct filesystem access
- do not write user "memory" back into `prompts/`; only the user manually edits those system files

## Memory Flush Priority

When compressing or flushing session state, preserve the following first:

1. user risk constraints
2. portfolio-specific guardrails
3. asset exclusions or preferences
4. important pending trade intentions
5. durable research conclusions worth carrying across sessions
