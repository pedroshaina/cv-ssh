## Projects

### yabe — Yet Another Block Explorer
github.com/pedroshaina/yabe · yabe.pdrlabs.com.br

- Bitcoin indexer, REST API and Next.js frontend in
  TypeScript, on PostgreSQL and Prisma.
- Handles chain reorganisations; one transaction per
  block, so a crash leaves consistent data.
- Committed OpenAPI contract; Playwright e2e tests
  against the full stack on regtest.

### k8s-homelab — GitOps Kubernetes platform
github.com/pedroshaina/k8s-homelab

- Kubernetes on one home machine, fully as code:
  OpenTofu, Talos Linux, Proxmox, Argo CD.
- Every change is a pull request; rollback is a revert.
- Cilium, cert-manager, SOPS + External Secrets,
  Prometheus, Grafana and Loki.

### pedromartins.dev.br — Site and blog
- Bilingual (EN / PT-BR) Astro site, deployed through
  GitHub Actions and Argo CD to the homelab.
