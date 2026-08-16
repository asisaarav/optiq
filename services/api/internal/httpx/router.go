package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/asisaarav/optiq/services/api/internal/optimizer"
)

// Version metadata, injected at build time via -ldflags.
var (
	Version = "dev"
	Commit  = "none"
)

// MaxCodeBytes bounds a single submission. Anything larger is a paste accident
// or an attack, never a real query.
const MaxCodeBytes = 50_000

// optimizeRequest is the public API contract for POST /v1/optimize.
type optimizeRequest struct {
	Engine string `json:"engine"`
	Code   string `json:"code"`
}

type engineInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	SQL     bool   `json:"sql"`
	Samples string `json:"sample,omitempty"`
}

// Router wires every route with its middleware stack.
func Router(log *slog.Logger, allowedOrigins []string, rl *RateLimiter) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// readyz is separate from healthz so an orchestrator can distinguish
	// "process alive" from "ready to serve traffic".
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(w, http.StatusOK, map[string]any{
			"status":  "ready",
			"version": Version,
			"commit":  Commit,
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /v1/engines", func(w http.ResponseWriter, r *http.Request) {
		out := make([]engineInfo, 0, len(optimizer.Engines))
		for _, e := range optimizer.Engines {
			kind := "runtime"
			if e.IsSQL() {
				kind = "sql"
			}
			out = append(out, engineInfo{ID: string(e), Name: e.Display(), Kind: kind, SQL: e.IsSQL()})
		}
		WriteJSON(w, http.StatusOK, map[string]any{"engines": out})
	})

	mux.HandleFunc("POST /v1/optimize", handleOptimize)
	mux.HandleFunc("POST /v1/validate", handleValidate)

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, r, http.StatusNotFound, "not_found", "No such endpoint.")
	})

	return Chain(mux,
		WithRequestID,
		WithRecovery(log),
		WithLogging(log),
		WithSecurityHeaders,
		WithCORS(allowedOrigins),
		WithMaxBody(MaxCodeBytes*2),
		WithRateLimit(rl),
	)
}

// decode reads and validates the request body, returning a user-safe message.
func decode(w http.ResponseWriter, r *http.Request) (optimizer.Engine, string, bool) {
	if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "application/json") {
		WriteError(w, r, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send application/json.")
		return "", "", false
	}

	var req optimizeRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			WriteError(w, r, http.StatusRequestEntityTooLarge, "payload_too_large", "Request body is too large.")
			return "", "", false
		}
		WriteError(w, r, http.StatusBadRequest, "invalid_json", "Body must be a JSON object with `engine` and `code`.")
		return "", "", false
	}

	engine := optimizer.Engine(strings.ToLower(strings.TrimSpace(req.Engine)))
	if !engine.Valid() {
		WriteError(w, r, http.StatusUnprocessableEntity, "unknown_engine",
			"Unknown engine. Call GET /v1/engines for the supported list.")
		return "", "", false
	}
	if strings.TrimSpace(req.Code) == "" {
		WriteError(w, r, http.StatusUnprocessableEntity, "empty_code", "`code` must not be empty.")
		return "", "", false
	}
	if len(req.Code) > MaxCodeBytes {
		WriteError(w, r, http.StatusRequestEntityTooLarge, "code_too_large", "`code` exceeds the 50 KB limit.")
		return "", "", false
	}
	return engine, req.Code, true
}

func handleOptimize(w http.ResponseWriter, r *http.Request) {
	engine, code, ok := decode(w, r)
	if !ok {
		return
	}
	WriteJSON(w, http.StatusOK, optimizer.Optimize(code, engine))
}

func handleValidate(w http.ResponseWriter, r *http.Request) {
	engine, code, ok := decode(w, r)
	if !ok {
		return
	}
	diags := optimizer.Validate(code, engine)
	if diags == nil {
		diags = []optimizer.Diagnostic{}
	}
	WriteJSON(w, http.StatusOK, map[string]any{"engine": engine, "diagnostics": diags})
}
