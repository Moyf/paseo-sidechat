# paseo-btw

Paseo plugin: `/btw <question>` — ask a side question from the context of the current agent session, answered in its own panel while the agent keeps working. Nothing is written to the main session.

## Usage

- In any agent composer, type `/btw <question>`. The panel opens and the answer streams in as markdown.
- Or open the btw panel from the Command Center (Ctrl+K) and ask from the input box at the bottom.
- The panel header shows the agent session it belongs to; press it to jump to that agent.
- The model picker lists the session provider's models; the default follows the main session.
- Clear wipes the panel's question history.

## How it works

The plugin's daemon-side code reads the main agent's recent timeline messages as context, spawns a `[btw]`-prefixed temporary agent in the same workspace (plan/read-only mode when available, no tools), streams the answer back to the panel. Follow-ups continue the same temporary agent, so each btw thread keeps its own Q&A history; threads stay open until you press Clear or the plugin/daemon reloads (optional idle auto-archive in the plugin settings, off by default). The main agent's session and transcript are never written to.

## Development

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-btw
paseo plugin reload paseo-btw
paseo plugin logs paseo-btw
```

`scripts/smoke.mjs` runs an end-to-end server-side check against the local daemon (creates a test session, asks a context-dependent side question, verifies the answer, archives the temp agent, and asserts the main transcript is untouched).

## Requirements

- Paseo >= 0.11.2.
- Works with any provider configured in the daemon; no extra credentials.
