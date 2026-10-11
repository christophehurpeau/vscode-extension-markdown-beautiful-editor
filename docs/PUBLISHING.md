# Publishing Guide

Releases are cut locally and published by GitHub Actions.

## Releasing a version

```bash
pnpm release --dry-run        # preview the version and CHANGELOG section
pnpm release                  # patch (default)
pnpm release minor            # or major, or an explicit x.y.z
```

`scripts/release.ts`:

1. checks you are on `main`, clean, and not behind `origin/main`;
2. computes the next version and renders a CHANGELOG section from the conventional commits since
   the last `v*` tag (`feat` → Added, `perf` and other breaking changes → Changed, `fix` → Fixed;
   `deps`-scoped and internal types are left out);
3. runs `compile-tests`, `test:unit` and `package`;
4. bumps `package.json`, prepends the section to `CHANGELOG.md`, commits `chore: vX.Y.Z`, creates the
   annotated tag `vX.Y.Z` and pushes `main` and the tag atomically.

To reword the changelog, run with `--dry-run`, then improve the commit messages it is built from
before releasing, or amend `CHANGELOG.md` in a follow-up commit (the Marketplace shows the version
published from the tag).

The tag push triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml), which
checks the tag matches `package.json`, runs the unit tests, builds the `.vsix`, publishes it to the
VS Code Marketplace and Open VSX, and creates a GitHub release with the CHANGELOG section and the
`.vsix`. Integration tests are not run there; run `pnpm test` before releasing a risky change.

If the workflow fails after the tag is pushed, fix the cause (secret, registry error) and
**Re-run jobs** on the same run: both publish steps use `--skip-duplicate`, so a registry that
already has the version is skipped. If the code itself must change, delete the tag locally and on
`origin`, fix, and release the same version again with `pnpm release x.y.z`.

## Open VSX authentication

The `chrp` namespace already exists and is verified on https://open-vsx.org. Create an access token
at https://open-vsx.org/user-settings/tokens (signed in with the account that owns the namespace),
then:

```bash
gh secret set OVSX_PAT                # paste the token
```

`ovsx` pulls `keytar` for local token storage; its native build is denied in
`pnpm-workspace.yaml` because CI passes the token through `OVSX_PAT`.

## Marketplace authentication

The workflow uses Microsoft Entra ID when the repository variable `AZURE_CLIENT_ID` is set,
otherwise the `VSCE_PAT` secret.

### PAT (until 2026-12-01)

Azure DevOps blocked creating new global PATs on 2026-03-15 and decommissions all of them on
2026-12-01 ([announcement](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops)).
The Marketplace requires a PAT scoped to **All accessible organizations** with
**Marketplace → Manage**, so an existing one keeps working only until that date.

```bash
pnpm exec vsce verify-pat chrp        # check the locally stored token
gh secret set VSCE_PAT                # paste the token
```

### Entra ID (required from 2026-12-01)

`vsce publish --azure-credential` (vsce >= 2.26.1) authenticates with the Azure CLI session that
`azure/login` opens through GitHub OIDC. Setup, once:

1. In the Entra tenant of the Microsoft account that owns the publisher, create an app registration
   (or a user-assigned managed identity).
2. Add a federated credential for GitHub Actions: organization `christophehurpeau`, repository
   `vscode-extension-markdown-beautiful-editor`, entity **Environment**, name `marketplace` (the
   workflow job runs in that environment, which gives a fixed OIDC subject for every tag).
3. Get the identity's Marketplace profile id by running once, in a temporary workflow step after
   `azure/login`:
   ```bash
   az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me \
     --resource 499b84ac-1321-427f-aa17-267ca6975798
   ```
   and add that `id` as a **Contributor** member of the `chrp` publisher at
   https://marketplace.visualstudio.com/manage.
4. Set the repository variables:
   ```bash
   gh variable set AZURE_CLIENT_ID --body <client-id>
   gh variable set AZURE_TENANT_ID --body <tenant-id>
   ```

This path is not yet exercised by a real release; see the
[VS Code publishing docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing)
for the reference procedure (written for Azure Pipelines).

## Manual publishing

Everything is bundled by esbuild and `node_modules` is excluded via `.vscodeignore`, so `vsce` is
always run with `--no-dependencies`: its npm-based dependency walk does not understand pnpm's
symlinked `node_modules`.

```bash
pnpm run package:vsce                           # build markdown-beautiful-editor-X.Y.Z.vsix
pnpm exec vsce ls --no-dependencies             # list the files that would ship
pnpm exec vsce publish --no-dependencies        # publish (PAT from `vsce login chrp` or VSCE_PAT)
pnpm exec vsce publish --pre-release --no-dependencies
pnpm exec ovsx publish markdown-beautiful-editor-X.Y.Z.vsix -p <token>
```

## Screenshots

```bash
pnpm exec playwright install chromium   # once per machine
pnpm run screenshots
```

Rewrites `images/screenshot.png`, `formatting.png`, `alerts.png` and `code.png`.
See [screenshots/README.md](../screenshots/README.md) to change what they show.

## Troubleshooting

- **Personal Access Token invalid**: the token expired, was scoped to a single organization instead
  of **All accessible organizations**, lacks **Marketplace → Manage**, or it is past 2026-12-01.
- **Tag does not match package.json**: the tag was created by hand; use `pnpm release`.
- **No CHANGELOG.md section for X.Y.Z**: the GitHub release step reads the section the release
  script wrote; the tag points at a commit without it.
