# Outer templates

The starters every [Outer](https://outer.now) project begins from. `create_app` copies one folder:

| Template | Folder | For |
| --- | --- | --- |
| `app` (default) | [`templates/app`](templates/app) | Interactive apps: Ilha + Void, D1, islands, PWA |
| `website` | [`templates/website`](templates/website) | Content sites: Astro + `@ilha/astro`, prerendered pages, a blog |

Each folder is a complete project with its own `package.json`, `AGENTS.md` and checks (`bun run check`). Outer pins this repo at one commit (`TEMPLATES_SHA` in `crates/outer/src/templates.rs`) and vendors it with `outer templates sync`.
