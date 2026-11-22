# kakap.io

Personal site. A tank of fish, animated with inverse kinematics.

## Layout

```
sim/          Gleam (JavaScript target). The behaviour: 2D chain + FABRIK (fish), 3D two-bone
              leg IK + gait (spider), steering, wander paths and waypoints.
src/stage/    TypeScript. The 2.5D spider scene: camera, ground scenery, ink drawing.
src/tank/     TypeScript. The 2D fish tank.
src/pages/    Astro pages. `/` is the spider scene, `/lab/spider` and `/lab/ik` are sandboxes.
```

The renderer never changes sim state. Each frame it calls the sim, reads the joints back, and draws them.

## Setup

[mise](https://mise.jdx.dev) installs the pinned versions of Gleam, Node and pnpm from `mise.toml`.

```sh
mise install
pnpm install
```

## Commands

| Command        | Action                                                        |
| -------------- | ------------------------------------------------------------- |
| `pnpm dev`     | Run the dev server. A `.gleam` change rebuilds the sim and reloads the page. |
| `pnpm test`    | Run the Gleam tests (`gleam test` in `sim/`).                 |
| `pnpm check`   | Type-check the Astro and TypeScript files.                    |
| `pnpm build`   | Build the static site into `dist/`.                           |
| `pnpm preview` | Build, then serve `dist/` with the local Cloudflare runtime.  |
| `pnpm deploy`  | Build, then deploy to Cloudflare Workers.                     |

## Deploy

The site is static files served by Cloudflare Workers (`wrangler.jsonc`).

GitHub Actions (`.github/workflows/deploy.yml`) tests and builds every push and pull request. On `master` it also deploys, if the repository has these secrets:

- `CLOUDFLARE_API_TOKEN`: a token with the "Edit Cloudflare Workers" template.
- `CLOUDFLARE_ACCOUNT_ID`
