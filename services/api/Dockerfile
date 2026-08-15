# ---- build ----------------------------------------------------------------
FROM golang:1.25-alpine AS build
WORKDIR /src

# Dependencies first so the layer caches across source edits.
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
ARG VERSION=dev
ARG COMMIT=none
# CGO off + trimpath + stripped symbols => small, reproducible, scratch-friendly.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags "-s -w -X github.com/asisaarav/optiq/services/api/internal/httpx.Version=${VERSION} -X github.com/asisaarav/optiq/services/api/internal/httpx.Commit=${COMMIT}" \
      -o /out/server ./cmd/server

# ---- runtime --------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/server /server
USER nonroot:nonroot
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/server"]
