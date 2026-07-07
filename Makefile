BINARY := bin/capycook
PKG := ./...

# Load .env (gitignored) so `make run`/`make test` see the keys .env.example documents.
-include .env
export

.PHONY: build build-all web run test vet fmt tidy docker-build clean eval-run eval-report eval-kappa

build:
	go build -o $(BINARY) ./cmd/server

web:
	cd web && npm ci && npm run build

build-all: web build

run:
	go run ./cmd/server

test:
	go test $(PKG)

vet:
	go vet $(PKG)

fmt:
	gofmt -l -w .

tidy:
	go mod tidy

docker-build:
	docker build -t capycook:dev .

# Eval harness (plan 4.4). Runs on the stub LLM; seeds default to the
# UNRATIFIED draft (warning printed) until Gate C ratifies eval/fixtures/
# seeds.json. Set EVAL_LABELS to a labeled-claim JSONL once labeling (4.6)
# produces one; without it, eval-report renders the no-data banner and
# eval-kappa asks for the flag.
EVAL_LABELS ?=
EVAL_LABELS_FLAG = $(if $(EVAL_LABELS),--labels=$(EVAL_LABELS))

eval-run:
	go run ./cmd/eval run --arm=all

eval-report:
	go run ./cmd/eval report $(EVAL_LABELS_FLAG)

eval-kappa:
	go run ./cmd/eval kappa --labels=$(EVAL_LABELS)

clean:
	rm -rf bin
