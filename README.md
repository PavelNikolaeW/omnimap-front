# OmniMap Frontend

The web client for **OmniMap** — visual knowledge mapping with real-time sync and an
offline-first local store. Written in plain JavaScript, no UI framework.

Part of a four-service platform: [omnimap-back](https://github.com/PavelNikolaeW/omnimap-back) ·
[omnimap-sync](https://github.com/PavelNikolaeW/omnimap-sync) ·
[omnimap-helm](https://github.com/PavelNikolaeW/omnimap-helm) ·
[omnimap-tgbot](https://github.com/PavelNikolaeW/omnimap-tgbot)

## Features

- **Block-tree canvas** — grid layout, custom renderer
- **Offline-first** — IndexedDB local store with an offline queue
- **Real-time sync** — WebSocket updates from `omnimap-sync`
- **Command system** — hotkeys and composable actions
- **Diagrams** — connections and shapes
- **LLM-assisted graph editing** — an agent can read part of a map, navigate it, and create
  blocks or whole subtrees

## Quick start

```bash
npm start          # dev against the remote backend
npm run start_local # dev against a local backend
npm run build      # production build
npm test           # unit tests (Jest)
npm run test:e2e   # end-to-end tests (Playwright)
```

CI runs on GitHub Actions and Gitverse. Architecture documentation lives in `docs/`:
API, State, Sync, Painter, Commands, Actions, Diagrams, LLM Graph.

## Architecture decisions

### No UI framework

The target was maps holding **thousands of blocks**, with panning as the primary interaction —
which re-renders the visible set continuously rather than patching a few nodes.

Before writing the renderer I measured that workload against **React** and **Alpine.js**. Both
introduced latency I judged unacceptable for continuous panning: the cost is per-update
framework overhead, and here every frame of movement is an update across the whole visible
tree, so that overhead lands on the hot path instead of amortising away.

The hand-written renderer does a **full re-render in roughly 100 ms** at the target scale.

**Cost, stated plainly:** no ecosystem, no component model, and a higher barrier for anyone
else joining the codebase. That is a real price, and it is only worth paying because rendering
throughput was the defining constraint of this particular UI. It would be the wrong call for
a conventional CRUD interface.

### Offline-first with IndexedDB and an offline queue

The client owns a local copy of the map and queues mutations while disconnected, so editing
never blocks on the network. The queue drains when the connection returns.

### Conflict resolution: last write wins, backed by history

When two clients edit the same block, **the last write wins**. Chosen for simplicity: no
vector clocks, no CRDT machinery, no merge semantics to reason about per block type.

**What that costs:** a concurrent edit can be overwritten, and the losing client sees its
change replaced.

**What makes it acceptable:** every block keeps a **change history**, with **undo and redo** on
top of it. An overwritten edit is recoverable rather than destroyed — which moves the failure
mode from data loss to a recoverable annoyance. For a knowledge-mapping tool with small
collaborating groups, that tradeoff buys a large simplification for a bounded cost.

A CRDT would remove the conflict entirely. It would also add a dependency, a larger payload
per block, and a class of bugs that is hard to reason about — not a trade worth making at this
scale.

### Updates arrive from a dedicated service

The client receives changes over WebSocket from `omnimap-sync`, not from the Django API.
Reasoning for the split is documented in
[omnimap-back](https://github.com/PavelNikolaeW/omnimap-back#architecture-decisions).

## Notes

Built with an agent-assisted workflow — `CLAUDE.md` holds the working agreement used during
development, and `docs/notes/` keeps the planning and analysis documents produced along the way.

MIT licensed.
