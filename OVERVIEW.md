# btw

btw adds side questions to agent sessions in Paseo. While an agent is working, you can ask a quick "by the way" question that is answered from the context of that session without sending anything to the agent or writing to its transcript.

## How it works

Type `/btw <question>` in any agent composer, or open the btw panel from the Command Center. The question is handled entirely by the plugin's daemon-side code:

1. It reads the recent user and assistant messages from the agent's timeline as context.
2. It creates a temporary agent in the same workspace, titled with a `[btw]` prefix, and asks it the question together with that context. The temporary agent is instructed to answer in plain text without tools, and a plan or read-only mode is selected when the provider offers one.
3. The panel polls for the answer and renders it as streaming markdown.

Follow-up questions continue the same temporary agent, so each thread keeps its own Q&A history plus the main session context it started with. Threads stay open until you press Clear, reload the plugin, or restart the daemon; optional idle auto-archiving is available in the plugin settings and is off by default.

The main agent never receives a message, and nothing is appended to its timeline. Answers live in the plugin's memory on the daemon and are cleared when the daemon restarts or when you press Clear.

## Model selection

The panel has a model picker that lists the models of the session's provider, defaulting to the model the session currently uses. The panel header shows which agent session it belongs to; pressing it opens that agent.

## Requirements

- Paseo 0.11.2 or later on the daemon.
- Any provider configured in Paseo. No API keys or accounts are needed by the plugin itself; it reuses the daemon's provider setup.

## Known limits

- Up to three side questions can run at the same time; each answer has a four minute timeout.
- Context is limited to the last 16 user and assistant messages (about 12,000 characters). Tool calls and reasoning items are not included.
- Question history is kept in memory per daemon run and per session, up to 50 questions per agent.
- Changing the model in the panel starts a new thread on the next question; a thread keeps the model it was created with.
