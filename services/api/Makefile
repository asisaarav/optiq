.PHONY: run test lint build cover fuzz docker

run:            ## start the API on :8080
	go run ./cmd/server

test:           ## unit tests with race detector
	go test ./... -race -count=1

cover:          ## coverage report
	go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out | tail -1

lint:           ## vet + formatting check
	go vet ./...
	@test -z "$$(gofmt -l .)" || (echo "gofmt needed:"; gofmt -l .; exit 1)

fuzz:           ## short fuzz run over the optimizer
	go test ./internal/optimizer -run=Fuzz -fuzz=FuzzOptimize -fuzztime=30s

build:
	CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o bin/server ./cmd/server

docker:
	docker build -t optiq-api:local .
