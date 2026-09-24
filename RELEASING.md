# Releasing Agent Retry

Releases use Changesets for versioning and npm trusted publishing (OIDC) for short-lived,
workflow-bound authentication.

## One-time npm bootstrap

The repository cannot create the npm account or scope automatically. npm also cannot configure a
trusted publisher before a package exists. To keep `0.1.0` as the first real release with OIDC
provenance, an npm owner must:

1. Create or confirm ownership of the `@agent-retry` npm organization.
2. Enable two-factor authentication.
3. Authenticate locally with `npm login` and verify the account with `npm whoami`.
4. Create each package with a minimal `0.0.0` placeholder published under the `bootstrap` tag.
   Do not publish the repository's `0.1.0` tarballs during this step.
5. In the settings for every `@agent-retry/*` package, add this trusted publisher:
   - provider: GitHub Actions;
   - organization or user: `holasoymalva`;
   - repository: `agent-retry`;
   - workflow filename: `release.yml`;
   - environment: `npm`;
   - allowed action: `npm publish`.
6. Run the protected **Publish packages** workflow to publish the real `0.1.0` packages.
7. After confirming OIDC publishing works, require 2FA and disallow token-based publishing.

Trusted publishing requires npm CLI 11.5.1+ and Node.js 22.14.0+. The release workflow installs a
compatible npm CLI and requests only the OIDC and repository permissions it needs.

The placeholder is necessary because npm's web UI currently exposes trusted-publisher settings only
after the package exists. Publishing the placeholder under a non-default tag preserves `0.1.0` as
the first installable stable release and lets that release receive npm's automatic provenance.

## Normal release flow

1. Add a Changeset to every pull request that changes a public package:

   ```bash
   pnpm changeset
   ```

2. Merge the change into `main`. The Changesets workflow creates or updates the version PR.
3. Review and merge the version PR.
4. Open GitHub Actions → **Publish packages** → **Run workflow**.
5. Select `latest` for stable releases or `next` for prereleases.
6. Approve the protected `npm` environment when prompted.
7. Verify package pages, provenance attestations, generated tags, and a clean consumer install.

No long-lived npm publish token is stored in GitHub. npm generates provenance automatically for
public packages published from this public repository through trusted publishing.

## Before `0.1.0`

- confirm all eight package names under `@agent-retry`;
- run `pnpm test:pack`;
- inspect `npm pack --dry-run` output;
- confirm the `npm` GitHub environment requires maintainer approval;
- configure `release.yml` as a trusted publisher for each package;
- publish with the `latest` dist-tag;
- install the published packages in a new directory and rerun the smoke example.
