// Events relay — forwards events between Redis Streams and external systems
package events

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
)

// StreamRelay consumes from Redis Streams and relays to downstream systems
type StreamRelay struct {
	Redis      *redis.Client
	StreamKeys []string
	GroupName  string
	ConsumerID string
}

func NewStreamRelay(redisURL string, streams []string, group, consumer string) (*StreamRelay, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis URL: %w", err)
	}
	client := redis.NewClient(opts)
	return &StreamRelay{
		Redis:      client,
		StreamKeys: streams,
		GroupName:  group,
		ConsumerID: consumer,
	}, nil
}

// EnsureGroups creates consumer groups for all streams if they don't exist
func (r *StreamRelay) EnsureGroups(ctx context.Context) error {
	for _, stream := range r.StreamKeys {
		err := r.Redis.XGroupCreateMkStream(ctx, stream, r.GroupName, "0").Err()
		if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
			return fmt.Errorf("failed to create group for stream %s: %w", stream, err)
		}
		log.Printf("[relay] Consumer group ready: %s / %s\n", stream, r.GroupName)
	}
	return nil
}

// Consume reads messages from all registered streams
func (r *StreamRelay) Consume(ctx context.Context, handler func(stream string, msg redis.XMessage) error) error {
	streams := make([]string, 0, len(r.StreamKeys)*2)
	for _, s := range r.StreamKeys {
		streams = append(streams, s)
	}
	for range r.StreamKeys {
		streams = append(streams, ">")
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		msgs, err := r.Redis.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    r.GroupName,
			Consumer: r.ConsumerID,
			Streams:  streams,
			Count:    10,
			Block:    0,
		}).Result()

		if err != nil {
			log.Printf("[relay] XReadGroup error: %v\n", err)
			continue
		}

		for _, stream := range msgs {
			for _, msg := range stream.Messages {
				if err := handler(stream.Stream, msg); err != nil {
					log.Printf("[relay] Handler error for %s/%s: %v\n", stream.Stream, msg.ID, err)
					continue
				}
				r.Redis.XAck(ctx, stream.Stream, r.GroupName, msg.ID)
			}
		}
	}
}
