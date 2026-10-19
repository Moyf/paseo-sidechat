# 侧聊 Side Chat (paseo-sidechat)

Side conversations for Paseo agent sessions. While an agent is working, ask parallel questions or run small side tasks without touching the main session.

- `/btw <question>` — ask a side question answered from the current session's context. The answer streams into the panel as markdown; nothing is sent to the main agent.
- `/side <task>` — same as `/btw`, but the side agent may use tools for small jobs.
- `/fork [first prompt]` — clone the current conversation into a new parallel session and explore it there.

## How it works

A question is handled entirely by the plugin's daemon-side code:

1. It reads the recent user and assistant messages from the agent's timeline as context.
2. It creates a temporary agent in the same workspace (labelled `btw: side-question`, optionally attached to the main session as a parent) and asks it the question together with that context. Advice threads run in a plan or read-only mode when the provider offers one; work threads follow the session's mode.
3. The panel polls for the answer and renders it as streaming markdown.

Follow-up questions continue the same temporary agent, so each thread keeps its own Q&A history. Threads persist to disk and survive plugin and daemon reloads; threads can also attach to the main session and archive with it (plugin setting, on by default). Idle auto-archiving is optional and off by default.

While an answer is still being generated, sending another question steers the running side agent (Paseo's native steering) instead of queueing: the earlier answer freezes as generated so far, and the new question takes over the turn.

The main agent never receives a message, and nothing is appended to its timeline. Questions, answers and side-thread identities are stored locally under `~/.paseo/plugin-data/paseo-sidechat/`. Prompt context (recent main-session messages) is sent to the side agent's provider, the same way the main session's own messages are.

## The panel

- Reply lock: press Reply on an answer to aim follow-ups at that exact thread; the header chip shows the target and ✕ releases it.
- Archive: retires the current thread's agent and removes its Q&A from the panel. Other threads are untouched.
- Model picker with text search; defaults to the model the session currently uses. Switching models starts a new thread on the next question.
- Live strip above the input shows the running question's streaming answer.
- Interface text follows the system language (Chinese or English). Answer appearance (heading, bold and highlight colors) is configurable in the plugin settings.

## Settings

- Attach threads to the main session (default on).
- Idle auto-archive with a configurable timeout (default off).
- Context message count read from the main session (default 8).

## Requirements

- Paseo 0.11.2 or later on the daemon.
- Any provider configured in Paseo. The plugin needs no API keys or accounts; it reuses the daemon's provider setup.

## Known limits

- Up to three side questions can run at the same time; each answer has a four minute timeout.
- Context is capped both by message count (settings) and total characters; tool calls and reasoning items are not included.
- The last 50 questions are kept overall, across all sessions.
