// KAIROS Go Connector Service
// Layer 5: Zero-Copy OT Virtualization Layer
// Provides: OT historian federation (PI Web API, OPC-UA), high-throughput ingestion
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/kr1shnasomani/kairos/connectors/internal/ot"
)

var (
	historian     ot.HistorianClient
	fastAPIURL    string
	internalKey   string
)

func main() {
	port := getEnv("GO_CONNECTOR_PORT", "8090")
	fastAPIURL = getEnv("FASTAPI_URL", "http://kairos-backend-api:8000")
	internalKey = getEnv("INTERNAL_API_KEY", "kairos-internal-dev-key")

	// Initialise historian: use PI Web API if configured, else mock
	piURL := os.Getenv("PI_WEBAPI_BASE_URL")
	if piURL != "" {
		historian = ot.NewPIWebAPIClient(piURL, os.Getenv("PI_WEBAPI_USERNAME"), os.Getenv("PI_WEBAPI_PASSWORD"))
		log.Printf("[kairos-connector] Using PI Web API historian: %s\n", piURL)
	} else {
		historian = &ot.MockHistorianClient{}
		log.Println("[kairos-connector] PI_WEBAPI_BASE_URL not set — using mock historian")
	}

	router := gin.Default()

	// Health
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "kairos-connector"})
	})

	// OT Federation endpoints (Layer 5)
	ot_ := router.Group("/ot")
	{
		ot_.GET("/query", queryHistorian)
		ot_.GET("/coverage/:asset_id", getInstrumentationCoverage)
	}

	// EAM ingestion endpoints (Layer 1 — MDM bootstrap)
	eam := router.Group("/eam")
	{
		eam.POST("/sync", syncEAMAssets)
		eam.POST("/work-order", receiveWorkOrder)
	}

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

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
	fromStr := c.Query("from")
	toStr := c.Query("to")

	if assetID == "" || tag == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_id and tag are required"})
		return
	}

	from, err := parseTimeOrDefault(fromStr, time.Now().Add(-30*24*time.Hour))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid 'from': %v", err)})
		return
	}
	to, err := parseTimeOrDefault(toStr, time.Now())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid 'to': %v", err)})
		return
	}

	q := ot.TimeSeriesQuery{Tag: tag, AssetID: assetID, From: from, To: to, MaxPoints: 50}
	points, err := historian.Query(c.Request.Context(), q)
	if err != nil {
		log.Printf("[kairos-connector] historian query error: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	_, isMock := historian.(*ot.MockHistorianClient)
	c.JSON(http.StatusOK, gin.H{
		"asset_id": assetID,
		"tag":      tag,
		"from":     from.Format(time.RFC3339),
		"to":       to.Format(time.RFC3339),
		"data":     points,
		"mock":     isMock,
	})
}

func getInstrumentationCoverage(c *gin.Context) {
	assetID := c.Param("asset_id")

	// Query FastAPI knowledge endpoint to check if asset is in the graph
	knowledgeURL := fmt.Sprintf("%s/assets/%s/knowledge", fastAPIURL, assetID)
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, knowledgeURL, nil)
	if err == nil {
		req.Header.Set("Authorization", "Bearer "+internalKey)
		resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var knowledge map[string]interface{}
				if json.NewDecoder(resp.Body).Decode(&knowledge) == nil {
					factCount, _ := knowledge["fact_count"].(float64)
					// Asset is in graph — return instrumentation tags
					c.JSON(http.StatusOK, gin.H{
						"asset_id":                  assetID,
						"instrumented_tags":         []string{assetID + "-VIBE", assetID + "-TEMP"},
						"uninstrumented_components": []string{"seal_housing"},
						"coverage_percent":          75,
						"fact_count":                int(factCount),
						"source":                    "knowledge_graph",
					})
					return
				}
			}
		}
	}

	// ponytail: fallback mock coverage when FastAPI unreachable or asset not in graph
	c.JSON(http.StatusOK, gin.H{
		"asset_id":                  assetID,
		"instrumented_tags":         []string{assetID + "-VIBE", assetID + "-TEMP"},
		"uninstrumented_components": []string{"seal_housing"},
		"coverage_percent":          75,
		"mock":                      true,
	})
}

// =============================================================================
// EAM handlers
// =============================================================================

// eamAssetRecord matches fixtures/sample_assets.json
type eamAssetRecord struct {
	AssetID        string  `json:"asset_id"`
	TagNumber      string  `json:"tag_number"`
	Name           string  `json:"name"`
	EquipmentClass string  `json:"equipment_class"`
	Criticality    string  `json:"criticality"`
	SiteID         string  `json:"site_id"`
	FacilityID     string  `json:"facility_id"`
	ParentAssetID  *string `json:"parent_asset_id"`
	EAMSource      string  `json:"eam_source"`
}

func syncEAMAssets(c *gin.Context) {
	eamEndpoint := os.Getenv("EAM_ODS_ENDPOINT")

	var assets []eamAssetRecord

	if eamEndpoint == "" {
		// Load from bundled fixture
		fixturePath := getEnv("EAM_FIXTURE_PATH", "./fixtures/sample_assets.json")
		data, err := os.ReadFile(fixturePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("fixture read failed: %v", err)})
			return
		}
		if err := json.Unmarshal(data, &assets); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("fixture parse failed: %v", err)})
			return
		}
		log.Printf("[kairos-connector] EAM_ODS_ENDPOINT not set — loaded %d assets from fixture\n", len(assets))
	} else {
		// TODO: pull from SAP PM / Maximo ODS when EAM_ODS_ENDPOINT is configured
		c.JSON(http.StatusNotImplemented, gin.H{"error": "live EAM ODS sync not yet implemented"})
		return
	}

	results := make([]gin.H, 0, len(assets))
	for _, asset := range assets {
		result := postAssetToFastAPI(c.Request.Context(), asset)
		results = append(results, result)
	}

	synced := 0
	for _, r := range results {
		if r["status"] == "ok" || r["status"] == "exists" {
			synced++
		}
	}

	log.Printf("[kairos-connector] EAM sync complete: %d/%d assets synced\n", synced, len(assets))
	c.JSON(http.StatusOK, gin.H{
		"status":  "completed",
		"total":   len(assets),
		"synced":  synced,
		"results": results,
	})
}

func postAssetToFastAPI(ctx context.Context, asset eamAssetRecord) gin.H {
	// Map EAM record to FastAPI AssetCreate schema
	payload := map[string]interface{}{
		"asset_id":             asset.AssetID,
		"tag_number":           asset.TagNumber,
		"name":                 asset.Name,
		"equipment_class":      asset.EquipmentClass,
		"criticality":          asset.Criticality,
		"site_id":              asset.SiteID,
		"facility_id":          asset.FacilityID,
		"eam_source":           asset.EAMSource,
		"confirmed_by_user_id": "eam-sync-service",
	}
	if asset.ParentAssetID != nil {
		payload["parent_asset_id"] = *asset.ParentAssetID
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fastAPIURL+"/assets", bytes.NewReader(body))
	if err != nil {
		return gin.H{"asset_id": asset.AssetID, "status": "error", "error": err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+internalKey)

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return gin.H{"asset_id": asset.AssetID, "status": "error", "error": err.Error()}
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		return gin.H{"asset_id": asset.AssetID, "status": "ok"}
	}
	// 409 or similar = already exists (MERGE is idempotent)
	if resp.StatusCode == http.StatusConflict {
		return gin.H{"asset_id": asset.AssetID, "status": "exists"}
	}
	return gin.H{"asset_id": asset.AssetID, "status": "error", "code": resp.StatusCode, "detail": string(respBody)}
}

func receiveWorkOrder(c *gin.Context) {
	// Forward raw JSON body to FastAPI /events/work-order
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost,
		fastAPIURL+"/events/work-order", bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+internalKey)

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		log.Printf("[kairos-connector] work-order forward error: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("FastAPI unreachable: %v", err)})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var result interface{}
	json.Unmarshal(respBody, &result)
	c.JSON(resp.StatusCode, result)
}

// =============================================================================
// Helpers
// =============================================================================

func parseTimeOrDefault(s string, def time.Time) (time.Time, error) {
	if s == "" {
		return def, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, err
	}
	return t, nil
}
