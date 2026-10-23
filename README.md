# homelab-apps-ci-cd-template

The homelab's release pipeline for its own apps (homelab ADR-0024). Create an app repository
from this template and it gets the pipeline from its first commit.

## What this is

```
PR → review → merge to master
  → test, build and push every image to GHCR (tag = commit SHA)
  → release commit in homelab-apps-gitops: apps/<APP>/kustomization.yaml pins the new
    <image>:<sha>@sha256:<digest>
  → Argo CD deploys it
```

The release job (`promote` in `.github/workflows/release.yaml`) acts as the GitHub App
`homelab-apps-release`: an identity, not a service. Each run exchanges the App's private key for a
1-hour token that can write to `homelab-apps-gitops` only, and its commits show as
`homelab-apps-release[bot]`. Nothing runs outside GitHub Actions. Pull requests test and build
the images without pushing them.

## New app checklist

The full walkthrough, with example manifests and checks after each step: homelab
`docs/onboarding-an-app.md`. In short:

1. GitHub → New repository → template `homelab-apps-ci-cd-template`. Public or private: private
   images are pulled with the cluster node's own GHCR credentials, nothing per app.
2. Replace the placeholder app (`main.go`) and the `Dockerfile`; keep the deployment contract
   (below).
3. In `.github/workflows/release.yaml`, edit only the two CONFIG blocks: `APP` (the app's folder
   in `homelab-apps-gitops`, which is also its onboarded name) and the `image` matrix (one entry
   per image, published as `ghcr.io/pedroshaina/<name>`). Replace the `test` job's steps with
   your app's tests.
4. Settings → Secrets and variables → Actions: variable `HOMELAB_APPS_CLIENT_ID` and secret
   `HOMELAB_APPS_PRIVATE_KEY` (the App's Client ID and private key, from the owner's 1Password).
   Templates don't copy secrets or variables.
5. In `homelab-apps-gitops`, a PR adding `apps/<APP>/`: the manifests, naming your images
   without tag (`image: ghcr.io/pedroshaina/<name>`), and a `kustomization.yaml` made with the
   tool, from the folder:

   ```bash
   kustomize create --resources "$(ls *.yaml | paste -sd, -)"
   ```

   No `images:` entry yet: the first release adds it. Rules: that repo's `CLUSTER-POLICIES.md`
   (conventions 8, 11 and 12).
6. Merge to `master` here: the first release pins the images in that `kustomization.yaml`.
7. The onboarding line in `homelab-platform-gitops` `components/teams/values.yaml` — only now
   does Argo CD deploy the app, already pinned.

## Releasing, rolling back, pausing

- **Release:** merge to `master`. Releases of one repo run one at a time, in merge order; a newer
  pending release replaces an older pending one.
- **Roll back:** revert the release commit in `homelab-apps-gitops` (a PR there). Then fix
  forward here; the next merge releases again.
- **Pause:** Actions → release → Disable workflow. Releases by hand meanwhile: homelab
  `docs/operations.md` (`kustomize edit set image`).
- **A release didn't arrive:** the run's summary lists the published images and the release
  commit; a red `promote` names the missing folder or image.

## Deployment contract

- `GET /health` (alive) and `GET /ready` (can serve traffic).
- Graceful shutdown on SIGTERM.
- JSON logs on stdout.
- Runs as a non-root user; `linux/amd64` images.
- Configuration through environment variables.

## Updating a copy

The header comments (`release v1`, `lint v1`) tell which template version a repository carries.
To update, copy the newer workflow and keep your CONFIG blocks and `test` steps.
