FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN go build -o /kairos-connector ./cmd/connector/...

FROM alpine:3.20 AS release
# hadolint ignore=DL3018
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /kairos-connector .

EXPOSE 8090
CMD ["./kairos-connector"]
