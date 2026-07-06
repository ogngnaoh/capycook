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

# --- Stage 3: minimal runtime (nonroot: uid 65532, least privilege) ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/capycook /capycook
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/capycook"]
