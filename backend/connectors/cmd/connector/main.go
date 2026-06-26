// KAIROS Go Connector Service
// Layer 5: Zero-Copy OT Virtualization Layer
// Provides: OT historian federation (PI Web API, OPC-UA), high-throughput ingestion
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	port := getEnv("GO_CONNECTOR_PORT", "8090")

	router := gin.Default()

	// Health
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "kairos-connector"})
	})

	// OT Federation endpoints (Layer 5)
	ot := router.Group("/ot")
	{
		// Query historian for a specific asset's telemetry over a time window
		ot.GET("/query", queryHistorian)

		// Check instrumentation coverage for an asset (which components are monitored)
		ot.GET("/coverage/:asset_id", getInstrumentationCoverage)
	}

	// EAM ingestion endpoints (Layer 1 — MDM bootstrap)
	eam := router.Group("/eam")
	{
		// Pull asset master data from EAM system
		eam.POST("/sync", syncEAMAssets)

		// Receive work order event from EAM
		eam.POST("/work-order", receiveWorkOrder)
	}

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("[kairos-connector] Listening on :%s\n", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-quit
	log.Println("[kairos-connector] Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Forced shutdown: %v", err)
	}

	log.Println("[kairos-connector] Stopped.")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// =============================================================================
// OT handlers
// =============================================================================

func queryHistorian(c *gin.Context) {
	assetID := c.Query("asset_id")
	tag := c.Query("tag")
	from := c.Query("from")
	to := c.Query("to")

	if assetID == "" || tag == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id and tag are required"})
		return
	}

	// TODO: route to appropriate historian client based on site config
	// - OSIsoft PI Web API: internal/ot/pi_client.go
	// - OPC-UA: internal/ot/opcua_client.go
	// - Honeywell Uniformance: internal/ot/uniformance_client.go
	// Data is queried ephemerally — never stored in KAIROS infrastructure
	c.JSON(http.StatusOK, gin.H{
		"asset_id":  assetID,
		"tag":       tag,
		"from":      from,
		"to":        to,
		"data":      []interface{}{},
		"note":      "OT historian client not yet wired. Configure PI_WEBAPI_BASE_URL or OPCUA_ENDPOINT_URL.",
	})
}

func getInstrumentationCoverage(c *gin.Context) {
	assetID := c.Param("asset_id")
	// TODO: cross-reference engineering drawing topology with historian tag registry
	// Returns: which specific components on this asset are directly instrumented
	c.JSON(http.StatusOK, gin.H{
		"asset_id":              assetID,
		"instrumented_tags":     []string{},
		"uninstrumented_components": []string{},
		"coverage_percent":     0,
		"note":                 "Instrumentation coverage map not yet built.",
	})
}

// =============================================================================
// EAM handlers
// =============================================================================

func syncEAMAssets(c *gin.Context) {
	// TODO: pull from SAP PM / Maximo / Infor EAM and forward to FastAPI /assets
	c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "note": "EAM sync not yet implemented."})
}

func receiveWorkOrder(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// TODO: forward to FastAPI /events/work-order via internal HTTP
	c.JSON(http.StatusAccepted, gin.H{"status": "accepted"})
}
