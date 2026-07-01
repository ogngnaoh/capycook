# syntax=docker/dockerfile:1

# --- Stage 1: static Go binary (CGO_ENABLED=0, pure-Go per SPEC §7) ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
# COPY go.sum ./            # add when the first dependency lands
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/capycook ./cmd/server

# --- Stage 2: web assets (Vite) — TODO: enable when /web is scaffolded (v2) ---
# FROM node:22-alpine AS web
# WORKDIR /web
# COPY web/ .
# RUN npm ci && npm run build

# --- Stage 3: minimal runtime (nonroot: uid 65532, least privilege) ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/capycook /capycook
# COPY --from=web /web/dist /web/dist   # TODO with the web stage
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/capycook"]
