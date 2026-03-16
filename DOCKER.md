# Running in Docker

This is a WIP, but at the time you can only use an API key and subscription based will not work.

## Build and bring up container

```bash
docker compose up -d --build
```

## Run

This is a manual process for now.

1. Launch the agent-comms API.
2. Run the agent loop.

```bash
docker compose exec agentine bash

```

```bash
cd projects/agent-comms/
uv run uvicorn agent_api.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
uv run agentine-dispatch yes
```
