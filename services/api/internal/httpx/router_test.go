package httpx

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testRouter() http.Handler {
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	return Router(log, []string{"https://code-optimizer.instaluxe.in"}, NewRateLimiter(1000, time.Minute))
}

func post(t *testing.T, h http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealthAndReady(t *testing.T) {
	h := testRouter()
	for _, path := range []string{"/healthz", "/readyz"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s returned %d", path, rec.Code)
		}
	}
}

func TestOptimizeHappyPath(t *testing.T) {
	rec := post(t, testRouter(), "/v1/optimize",
		`{"engine":"mysql","code":"SELECT * FROM orders WHERE DATE(created_at) = '2024-01-01';"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Output  string                   `json:"output"`
		Speedup int                      `json:"speedup"`
		Changes []struct{ Title string } `json:"changes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("bad json: %v", err)
	}
	if !strings.Contains(out.Output, "created_at >=") {
		t.Fatalf("no rewrite in output: %s", out.Output)
	}
	if !strings.Contains(rec.Body.String(), "SARGable") {
		t.Fatal("expected the SARGable change to be reported")
	}
	if rec.Header().Get("X-Request-Id") == "" {
		t.Fatal("missing correlation id")
	}
}

func TestValidationErrors(t *testing.T) {
	h := testRouter()
	cases := []struct {
		name, body string
		status     int
		code       string
	}{
		{"unknown engine", `{"engine":"mongodb","code":"x"}`, http.StatusUnprocessableEntity, "unknown_engine"},
		{"empty code", `{"engine":"mysql","code":"   "}`, http.StatusUnprocessableEntity, "empty_code"},
		{"bad json", `{"engine":`, http.StatusBadRequest, "invalid_json"},
		{"unknown field", `{"engine":"mysql","code":"x","evil":1}`, http.StatusBadRequest, "invalid_json"},
		{"oversized code", `{"engine":"mysql","code":"` + strings.Repeat("a", MaxCodeBytes+10) + `"}`, http.StatusRequestEntityTooLarge, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := post(t, h, "/v1/optimize", c.body)
			if rec.Code != c.status {
				t.Fatalf("want %d, got %d (%s)", c.status, rec.Code, rec.Body.String())
			}
			if c.code != "" && !strings.Contains(rec.Body.String(), c.code) {
				t.Fatalf("want code %s in %s", c.code, rec.Body.String())
			}
		})
	}
}

func TestSecurityHeadersAndCORS(t *testing.T) {
	h := testRouter()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "https://code-optimizer.instaluxe.in")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	for k, want := range map[string]string{
		"X-Content-Type-Options":      "nosniff",
		"X-Frame-Options":             "DENY",
		"Access-Control-Allow-Origin": "https://code-optimizer.instaluxe.in",
	} {
		if got := rec.Header().Get(k); got != want {
			t.Fatalf("%s = %q, want %q", k, got, want)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("CORS echoed an origin that is not allow-listed")
	}
}

func TestRateLimit(t *testing.T) {
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	h := Router(log, nil, NewRateLimiter(2, time.Minute))
	body := `{"engine":"mysql","code":"SELECT 1;"}`

	for i := 0; i < 2; i++ {
		if rec := post(t, h, "/v1/optimize", body); rec.Code != http.StatusOK {
			t.Fatalf("request %d rejected early: %d", i+1, rec.Code)
		}
	}
	rec := post(t, h, "/v1/optimize", body)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("429 must include Retry-After")
	}
}

func TestRateLimiterWindowResets(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	now := time.Now()
	rl.now = func() time.Time { return now }

	if ok, _, _ := rl.Allow("ip"); !ok {
		t.Fatal("first request should pass")
	}
	if ok, _, _ := rl.Allow("ip"); ok {
		t.Fatal("second request should be limited")
	}
	now = now.Add(2 * time.Minute)
	if ok, _, _ := rl.Allow("ip"); !ok {
		t.Fatal("window should have reset")
	}
}

func TestClientIPPrefersProxyHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:5555"
	if got := ClientIP(req); got != "10.0.0.1" {
		t.Fatalf("socket fallback = %s", got)
	}
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 70.41.3.18")
	if got := ClientIP(req); got != "203.0.113.9" {
		t.Fatalf("xff = %s", got)
	}
	req.Header.Set("CF-Connecting-IP", "198.51.100.7")
	if got := ClientIP(req); got != "198.51.100.7" {
		t.Fatalf("cf header = %s", got)
	}
}

func TestPanicRecovery(t *testing.T) {
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	boom := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })
	h := Chain(boom, WithRequestID, WithRecovery(log))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "internal_error") {
		t.Fatalf("unexpected body %s", rec.Body.String())
	}
}

func TestEnginesEndpoint(t *testing.T) {
	rec := httptest.NewRecorder()
	testRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/engines", nil))
	var out struct {
		Engines []struct {
			ID, Name, Kind string
		} `json:"engines"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Engines) != 12 {
		t.Fatalf("want 12 engines, got %d", len(out.Engines))
	}
}

func TestUnknownRouteIsJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	testRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/nope", nil))
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "not_found") {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
