BINARY := bin/capycook
PKG := ./...

.PHONY: build build-all web run test vet fmt tidy docker-build clean

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

clean:
	rm -rf bin
