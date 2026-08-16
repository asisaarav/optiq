// Command server runs the OPTIQ API: a stateless HTTP service exposing the
// optimizer rule engine. Configuration is environment-only (12-factor), logs are
// structured JSON, and shutdown drains in-flight requests.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/asisaarav/optiq/services/api/internal/httpx"
)

type config struct {
	Addr            string
	AllowedOrigins  []string
	RateLimit       int
	RateWindow      time.Duration
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	IdleTimeout     time.Duration
	ShutdownTimeout time.Duration
	LogLevel        slog.Level
}

func envStr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envDur(key string, def time.Duration) time.Duration {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func loadConfig() config {
	level := slog.LevelInfo
	if err := level.UnmarshalText([]byte(envStr("LOG_LEVEL", "info"))); err != nil {
		level = slog.LevelInfo
	}

	var origins []string
	for _, o := range strings.Split(envStr("ALLOWED_ORIGINS", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}

	return config{
		Addr:            ":" + envStr("PORT", "8080"),
		AllowedOrigins:  origins,
		RateLimit:       envInt("RATE_LIMIT", 60),
		RateWindow:      envDur("RATE_WINDOW", time.Minute),
		ReadTimeout:     envDur("READ_TIMEOUT", 10*time.Second),
		WriteTimeout:    envDur("WRITE_TIMEOUT", 20*time.Second),
		IdleTimeout:     envDur("IDLE_TIMEOUT", 90*time.Second),
		ShutdownTimeout: envDur("SHUTDOWN_TIMEOUT", 15*time.Second),
		LogLevel:        level,
	}
}

func main() {
	cfg := loadConfig()
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(log)

	limiter := httpx.NewRateLimiter(cfg.RateLimit, cfg.RateWindow)
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           httpx.Router(log, cfg.AllowedOrigins, limiter),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	// Signal handling first, so a fast Ctrl-C during startup still drains.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		log.Info("server_starting",
			slog.String("addr", cfg.Addr),
			slog.String("version", httpx.Version),
			slog.String("commit", httpx.Commit),
			slog.Int("rate_limit", cfg.RateLimit),
			slog.Any("allowed_origins", cfg.AllowedOrigins),
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		log.Error("server_failed", slog.Any("error", err))
		os.Exit(1)
	case <-ctx.Done():
		log.Info("shutdown_signal_received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful_shutdown_failed", slog.Any("error", err))
		os.Exit(1)
	}
	log.Info("shutdown_complete")
}
