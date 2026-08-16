// Package httpx contains the transport layer: middleware, routing and handlers.
// Everything here is stdlib-only so the service has no third-party runtime
// dependencies to audit or patch.
package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

// RequestID returns the correlation ID attached to the request, if any.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

func newID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b[:])
}

// statusRecorder captures the status code and byte count for access logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// Middleware is the standard decorator shape used throughout the service.
type Middleware func(http.Handler) http.Handler

// Chain applies middleware so the first entry is the outermost wrapper.
func Chain(h http.Handler, mw ...Middleware) http.Handler {
	for i := len(mw) - 1; i >= 0; i-- {
		h = mw[i](h)
	}
	return h
}

// WithRequestID attaches (or propagates) a correlation ID and echoes it back.
func WithRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" || len(id) > 64 {
			id = newID()
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

// WithLogging emits one structured access log line per request.
func WithLogging(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			log.LogAttrs(r.Context(), slog.LevelInfo, "http_request",
				slog.String("request_id", RequestID(r.Context())),
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", rec.status),
				slog.Int("bytes", rec.bytes),
				slog.Duration("duration", time.Since(start)),
			)
		})
	}
}

// WithRecovery converts a panic into a 500 without killing the process.
func WithRecovery(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.LogAttrs(r.Context(), slog.LevelError, "panic_recovered",
						slog.String("request_id", RequestID(r.Context())),
						slog.Any("panic", rec),
					)
					WriteError(w, r, http.StatusInternalServerError, "internal_error", "Something went wrong on our side.")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// WithSecurityHeaders sets the baseline headers for a JSON API.
func WithSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cross-Origin-Resource-Policy", "same-site")
		if r.TLS != nil {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// WithCORS answers preflights and echoes only allowed origins. An empty allow
// list means "same-origin only": no CORS headers are emitted at all.
func WithCORS(allowed []string) Middleware {
	set := make(map[string]bool, len(allowed))
	wildcard := false
	for _, o := range allowed {
		o = strings.TrimSpace(o)
		if o == "*" {
			wildcard = true
		}
		if o != "" {
			set[o] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (wildcard || set[origin]) {
				h := w.Header()
				if wildcard {
					h.Set("Access-Control-Allow-Origin", "*")
				} else {
					h.Set("Access-Control-Allow-Origin", origin)
					h.Add("Vary", "Origin")
				}
				h.Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
				h.Set("Access-Control-Max-Age", "86400")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// WithMaxBody rejects oversized payloads before any decoding happens.
func WithMaxBody(limit int64) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimiter is a fixed-window per-client limiter. It is intentionally simple
// and in-process; a multi-instance deployment should front it with a shared
// store, which is why the window and limit are injectable.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	limit   int
	window  time.Duration
	now     func() time.Time
}

type bucket struct {
	count   int
	resetAt time.Time
}

// NewRateLimiter builds a limiter allowing limit requests per window per client.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{buckets: map[string]*bucket{}, limit: limit, window: window, now: time.Now}
}

// Allow reports whether the client may proceed, plus remaining quota and the
// retry-after hint in seconds when it may not.
func (rl *RateLimiter) Allow(client string) (ok bool, remaining int, retryAfter int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()

	b, found := rl.buckets[client]
	if !found || now.After(b.resetAt) {
		if len(rl.buckets) > 10_000 { // bound memory: drop expired entries
			for k, v := range rl.buckets {
				if now.After(v.resetAt) {
					delete(rl.buckets, k)
				}
			}
		}
		rl.buckets[client] = &bucket{count: 1, resetAt: now.Add(rl.window)}
		return true, rl.limit - 1, 0
	}

	b.count++
	if b.count > rl.limit {
		return false, 0, int(b.resetAt.Sub(now).Seconds()) + 1
	}
	return true, rl.limit - b.count, 0
}

// ClientIP prefers the left-most X-Forwarded-For entry (set by Cloudflare or any
// trusted proxy) and falls back to the socket address.
func ClientIP(r *http.Request) string {
	if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
		return cf
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// WithRateLimit enforces the limiter and sets the standard quota headers.
func WithRateLimit(rl *RateLimiter) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ok, remaining, retry := rl.Allow(ClientIP(r))
			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(rl.limit))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
			if !ok {
				w.Header().Set("Retry-After", strconv.Itoa(retry))
				WriteError(w, r, http.StatusTooManyRequests, "rate_limited",
					"Too many requests. Retry in "+strconv.Itoa(retry)+"s.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ErrorBody is the single error shape every endpoint returns.
type ErrorBody struct {
	Error struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
		RequestID string `json:"request_id,omitempty"`
	} `json:"error"`
}

// WriteJSON serializes v with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError emits the canonical error envelope, including the correlation ID so
// a user-reported failure can be found in the logs.
func WriteError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	var body ErrorBody
	body.Error.Code = code
	body.Error.Message = message
	body.Error.RequestID = RequestID(r.Context())
	WriteJSON(w, status, body)
}
