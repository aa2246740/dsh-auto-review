# Development

`main` is the only maintained branch. Version 0.3.0 consolidates the locally used implementation and the previous installation improvements. Historical work remains in Git history; old compatibility and completed PR branches are no longer maintained.

Install dependencies with `pnpm install --ignore-workspace`, then run `pnpm test` and `pnpm run typecheck`. The package uses a standalone TypeScript configuration and the published DSH 0.1.5-rc.2 APIs.

To rebuild the committed Host and client bundles, use a matching Harness checkout with DSHX installed. Set `DSHX_HARNESS` to that checkout, or use the checkout registered by DSHX in `~/.config/dshx/harness`, then run `pnpm run build`. The adapter resolves the target Web platform module table and emits the lazy-CJS client entry. Commit the rebuilt `lib/` together with source changes. Ordinary plugin installation uses these committed artifacts and does not run a build.

Local delivery notes, Host identities, user configuration, approval history and credentials are not release inputs. Screenshots under `docs/screenshots/` document an older UI.
