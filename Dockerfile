# syntax=docker/dockerfile:1

# Build natively on the build host: the output is plain JS with no native
# addons (ssh2's optional crypto bindings are never built), so it runs on any
# target architecture without slow emulation.
FROM --platform=$BUILDPLATFORM node:24-trixie-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod
# Writable home for a generated host key when none is mounted.
RUN mkdir /data

# Pinned to the amd64 manifest digest (the cluster is amd64-only). This keeps
# builds reproducible and stops builders that mis-resolve platforms in
# multi-stage builds (seen with Podman 4.9) from pulling the arm64 variant.
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:08f79a9950f89e561bd52940a172a918a233f51a28556c91b3e640cc869a66ca
WORKDIR /app
ENV NODE_ENV=production \
    PORT=2222 \
    HOST_KEY_PATH=/data/host_ed25519 \
    CONTENT_DIR=/app/content
# package.json is needed at runtime for "type": "module".
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build --chown=nonroot:nonroot /data /data
COPY content ./content
EXPOSE 2222 8080
CMD ["dist/index.js"]
