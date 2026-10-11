# Publishing Guide

Releases run entirely in GitHub Actions: nothing is versioned, tagged or published from a local
machine.

## Releasing a version

GitHub → **Actions** → **Release** → **Run workflow** on `main`.

- **Dry run** checked: runs the tests, prints what
  [`pob-version`](https://github.com/christophehurpeau/pob/tree/main/@pob/version) would release,
  and checks the Marketplace (Entra ID) and Open VSX credentials.
- **Dry run** unchecked: releases.

[`.github/workflows/release.yml`](../.github/workflows/release.yml) has two jobs:

1. **version**: runs `compile-tests`, `test:unit` and `package`, then `pob-version
   --create-release=github`, which computes the bump from the conventional commits since the last
   `v*` tag (`feat` → minor, `fix` → patch; on 0.x a breaking change is a minor), prepends the
   section to `CHANGELOG.md`, bumps `package.json`, commits `chore: release X.Y.Z [skip ci]`, tags
   `vX.Y.Z`, pushes and creates the GitHub release. With no releasable commit it does nothing.
2. **publish**: checks out the tag, builds the `.vsix`, publishes it to the VS Code Marketplace and
   Open VSX, and attaches it to the GitHub release.

If **publish** fails, fix the cause and use **Re-run failed jobs**: it starts from the tag without
versioning again, and both registries skip a version they already have (`--skip-duplicate`).

Integration tests are not run by the workflow; run `pnpm test` before releasing a risky change.

The **Bump** input overrides the computed bump type (`pob-version --force`); keep `auto` to follow
the commits.

## Repository setup

| Name | Kind | Purpose |
| --- | --- | --- |
| `PUSH_DEPLOY_KEY` | secret | private half of the read-write deploy key "Push Github Actions Key"; the push of the release commit and tag uses it |
| `OVSX_PAT` | secret | Open VSX access token |
| `AZURE_CLIENT_ID` | variable | Entra app registration used for the Marketplace |
| `AZURE_TENANT_ID` | variable | its tenant |
| `marketplace` | environment | the **publish** and **check-auth** jobs run in it; the Entra federated credential trusts it |

The `main` ruleset requires the reviewflow status checks; deploy keys are exempt so the release
commit can be pushed.

### Open VSX

Token from https://open-vsx.org/user-settings/tokens (account owning the verified `chrp`
namespace), stored with `gh secret set OVSX_PAT`.

`ovsx` pulls `keytar` for local token storage; its native build is denied in
`pnpm-workspace.yaml` because CI passes the token through `OVSX_PAT`.

### VS Code Marketplace (Entra ID, no token)

Azure DevOps PATs are not used: global PATs, the only kind the Marketplace accepts, cannot be
created since 2026-03-15 and stop working on 2026-12-01
([announcement](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops)).
`azure/login` signs in through GitHub OIDC and `vsce publish --azure-credential` uses that session.

Setup, once:

1. https://portal.azure.com → **Microsoft Entra ID** → **App registrations** → **New
   registration**, single tenant. Note the **Application (client) ID** and **Directory (tenant)
   ID**.
2. In the app: **Certificates & secrets** → **Federated credentials** → **Add credential** →
   *GitHub Actions deploying Azure resources*: organization `christophehurpeau`, repository
   `vscode-extension-markdown-beautiful-editor`, entity **Environment**, name `marketplace`.
3. ```bash
   gh variable set AZURE_CLIENT_ID --body <client-id>
   gh variable set AZURE_TENANT_ID --body <tenant-id>
   ```
4. Run **Release** with **Dry run**. The **check-auth** job's *Show Marketplace identity* step
   prints an `id`.
5. https://marketplace.visualstudio.com/manage/publishers/chrp → **Members** → add that `id` with
   the **Contributor** role.

Reference: [VS Code publishing docs, secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing)
(written for a managed identity in Azure Pipelines).

## Packaging locally

Everything is bundled by esbuild and `node_modules` is excluded via `.vscodeignore`, so `vsce` is
always run with `--no-dependencies`: its npm-based dependency walk does not understand pnpm's
symlinked `node_modules`.

```bash
pnpm run package:vsce                   # build markdown-beautiful-editor-X.Y.Z.vsix to try locally
pnpm exec vsce ls --no-dependencies     # list the files that would ship
```

## Screenshots

```bash
pnpm exec playwright install chromium   # once per machine
pnpm run screenshots
```

Rewrites `images/screenshot.png`, `formatting.png`, `alerts.png` and `code.png`.
See [screenshots/README.md](../screenshots/README.md) to change what they show.

## Troubleshooting

- **version job fails on push**: `PUSH_DEPLOY_KEY` is missing, or the deploy key lost its write
  access or its ruleset exemption.
- **azure/login fails**: the federated credential subject must be
  `repo:christophehurpeau/vscode-extension-markdown-beautiful-editor:environment:marketplace`.
- **vsce 401/403 with --azure-credential**: the identity is not a member of the `chrp` publisher,
  or not as Contributor.
- **ovsx "Invalid access token"**: regenerate it and update `OVSX_PAT`.
