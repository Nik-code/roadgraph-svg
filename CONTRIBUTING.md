# Contributing to roadgraph-svg

Thank you for your interest in contributing. This document outlines how to get started.

## Getting started

1. **Fork and clone** the repository.
2. **Install** (optional; no runtime deps):
   ```bash
   npm install
   ```
3. **Run locally**:
   ```bash
   npm run dev
   ```

## Development

- **Entry point:** `server/index.js`
- **Frontend:** `public/` (vanilla JS + Leaflet)
- **Core logic:** `server/lib/` (geo, overpass, roadgraph)

Use `npm run dev:watch` for automatic restart on file changes (Node 18+).

## Pull requests

1. Create a branch from `main`.
2. Make focused changes with clear commit messages.
3. Ensure the app still runs and basic flows work.
4. Open a PR with a short description of what changed and why.

There are no automated tests yet; manual verification is appreciated.

## Code style

- Use the existing style: ES modules, `const`/`let`, async/await where appropriate.
- Keep functions small and modules focused.
- Add JSDoc for public APIs when helpful.

## Areas to contribute

- **Bugs** — Report issues with clear steps to reproduce.
- **Features** — Open an issue first to discuss scope.
- **Documentation** — Fix typos, clarify README, add examples.
- **Performance** — Improve Overpass query handling or projection logic.
- **Accessibility** — Improve ARIA, keyboard nav, contrast.

## Questions

Open a GitHub issue for questions or discussions.
