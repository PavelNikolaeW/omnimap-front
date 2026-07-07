# OmniMap Frontend

The web UI for **OmniMap** — visual knowledge mapping with real-time sync and an
**offline-first** local store. One microservice in the OmniMap platform (see
[omnimap-back](https://github.com/PavelNikolaeW/omnimap-back) and
[omnimap-sync](https://github.com/PavelNikolaeW/omnimap-sync)).

## Highlights

- **Block-tree canvas** with a grid layout engine and a custom renderer (Painter)
- **Offline-first** — IndexedDB block storage with an offline queue
- **Real-time sync** over WebSocket
- **Command system** — hotkeys and a composable action layer
- **Diagrams** — connections and shapes between blocks
- **LLM-assisted graph editing** — AI helps build and edit the map

## Quick start

```bash
npm start           # dev server (remote backend)
npm run start_local # dev server (local backend)
npm run build       # production build
npm test            # unit tests
npm run test:e2e    # E2E tests
```

## Docs

Architecture and per-module docs live in [`docs/`](docs/) — API, State, Sync,
Painter, Commands, Actions, Diagrams, LLM Graph, and more.
