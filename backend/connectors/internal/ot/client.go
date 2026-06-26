// OT historian client interface and implementations
// Supports: OSIsoft PI Web API, OPC-UA, Honeywell Uniformance, Generic REST
package ot

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// TimeSeriesPoint is a single measurement from the historian
type TimeSeriesPoint struct {
	Timestamp time.Time   `json:"timestamp"`
	Value     interface{} `json:"value"`
	Quality   string      `json:"quality"` // Good, Bad, Uncertain
}

// TimeSeriesQuery defines a historian query (ephemeral — data never stored)
type TimeSeriesQuery struct {
	Tag       string    `json:"tag"`
	AssetID   string    `json:"asset_id"`
	From      time.Time `json:"from"`
	To        time.Time `json:"to"`
	MaxPoints int       `json:"max_points"`
}

// HistorianClient is the interface all historian connectors implement
type HistorianClient interface {
	Query(ctx context.Context, q TimeSeriesQuery) ([]TimeSeriesPoint, error)
	Health(ctx context.Context) error
}

// =============================================================================
// PI Web API Client (OSIsoft / AVEVA)
// IEC 62443 compliance required before activating any OT connection.
// =============================================================================

type PIWebAPIClient struct {
	BaseURL    string
	Username   string
	Password   string
	HTTPClient *http.Client
}

func NewPIWebAPIClient(baseURL, username, password string) *PIWebAPIClient {
	return &PIWebAPIClient{
		BaseURL:  baseURL,
		Username: username,
		Password: password,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *PIWebAPIClient) Query(ctx context.Context, q TimeSeriesQuery) ([]TimeSeriesPoint, error) {
	if c.BaseURL == "" {
		return nil, fmt.Errorf("PI Web API not configured: set PI_WEBAPI_BASE_URL in .env")
	}
	// TODO: implement PI Web API stream/recorded values query
	// Endpoint: GET {baseURL}/streams/{webid}/recorded?startTime={from}&endTime={to}
	// IEC 62443 zone/conduit design must be approved before this goes live
	return []TimeSeriesPoint{}, nil
}

func (c *PIWebAPIClient) Health(ctx context.Context) error {
	if c.BaseURL == "" {
		return fmt.Errorf("PI Web API not configured")
	}
	// TODO: GET {baseURL}/system/userinfo
	return nil
}

// =============================================================================
// OPC-UA Client
// =============================================================================

type OPCUAClient struct {
	EndpointURL string
}

func NewOPCUAClient(endpointURL string) *OPCUAClient {
	return &OPCUAClient{EndpointURL: endpointURL}
}

func (c *OPCUAClient) Query(ctx context.Context, q TimeSeriesQuery) ([]TimeSeriesPoint, error) {
	if c.EndpointURL == "" {
		return nil, fmt.Errorf("OPC-UA not configured: set OPCUA_ENDPOINT_URL in .env")
	}
	// TODO: implement OPC-UA historical read using gopcua library
	return []TimeSeriesPoint{}, nil
}

func (c *OPCUAClient) Health(ctx context.Context) error {
	if c.EndpointURL == "" {
		return fmt.Errorf("OPC-UA not configured")
	}
	return nil
}
