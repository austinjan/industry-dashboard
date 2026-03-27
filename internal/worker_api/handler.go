package worker_api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/industry-dashboard/server/internal/apierr"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

var validCommands = map[string]bool{
	"stop":    true,
	"restart": true,
	// "reload_config" is defined in the spec but not yet implemented in the worker.
	// It will be added here once the worker-side implementation is complete.
}

// ListWorkers returns all workers as a JSON array.
func (h *Handler) ListWorkers(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	workers, err := h.store.ListWorkers(r.Context())
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(workers)
}

// GetWorker returns a single worker by ID with machines and recent commands.
func (h *Handler) GetWorker(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid worker ID", userID, nil)
		return
	}

	detail, err := h.store.GetWorker(r.Context(), workerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "worker not found", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

// SendCommand sends a command to a worker.
func (h *Handler) SendCommand(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid worker ID", userID, nil)
		return
	}

	var body struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid request body", userID, nil)
		return
	}

	if !validCommands[body.Command] {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid command", userID, nil)
		return
	}

	cmd, err := h.store.SendCommand(r.Context(), workerID, body.Command)
	if err != nil {
		if errors.Is(err, ErrWorkerNotFound) {
			apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "worker not found", userID, nil)
			return
		}
		if errors.Is(err, ErrWorkerOffline) {
			apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "worker is offline, cannot send commands", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cmd)
}

// ListCommands returns paginated commands for a worker.
func (h *Handler) ListCommands(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid worker ID", userID, nil)
		return
	}

	limit := 20
	offset := 0

	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n > 0 {
			if n > 100 {
				n = 100
			}
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n >= 0 {
			offset = n
		}
	}

	commands, total, err := h.store.ListCommands(r.Context(), workerID, limit, offset)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"commands": commands,
		"total":    total,
	})
}

// GetWorkerConfig returns the running config JSON for a worker.
func (h *Handler) GetWorkerConfig(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid worker ID", userID, nil)
		return
	}

	configJSON, err := h.store.GetWorkerConfig(r.Context(), workerID)
	if err != nil {
		if errors.Is(err, ErrWorkerNotFound) {
			apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "worker not found", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}

	if configJSON == nil {
		apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "no config stored for this worker", userID, nil)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(configJSON)
}
