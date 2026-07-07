# syntax=docker/dockerfile:1

# --- Stage 1: build the Vite SPA into web/dist ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ .
RUN npm run build

# --- Stage 2: static Go binary embedding the built SPA (CGO_ENABLED=0) ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o /out/capycook ./cmd/server
# Empty dir staged here because distroless has no shell to mkdir with.
RUN mkdir -p /out/data

# --- Stage 3: minimal runtime (nonroot: uid 65532, least privilege) ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/capycook /capycook
# /data is the SQLite home: owned by the nonroot uid so the server can write
# it, declared a volume so the database outlives any single container.
COPY --from=build --chown=65532:65532 /out/data /data
ENV DB_PATH=/data/capycook.db
VOLUME /data
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/capycook"]
