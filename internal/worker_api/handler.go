package worker_api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

var validCommands = map[string]bool{
	"stop":          true,
	"restart":       true,
	"reload_config": true,
}

// ListWorkers returns all workers as a JSON array.
func (h *Handler) ListWorkers(w http.ResponseWriter, r *http.Request) {
	workers, err := h.store.ListWorkers(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(workers)
}

// GetWorker returns a single worker by ID with machines and recent commands.
func (h *Handler) GetWorker(w http.ResponseWriter, r *http.Request) {
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		http.Error(w, "invalid worker ID", http.StatusBadRequest)
		return
	}

	detail, err := h.store.GetWorker(r.Context(), workerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "worker not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

// SendCommand sends a command to a worker.
func (h *Handler) SendCommand(w http.ResponseWriter, r *http.Request) {
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		http.Error(w, "invalid worker ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if !validCommands[body.Command] {
		http.Error(w, "invalid command", http.StatusBadRequest)
		return
	}

	cmd, err := h.store.SendCommand(r.Context(), workerID, body.Command)
	if err != nil {
		if errors.Is(err, ErrWorkerNotFound) {
			http.Error(w, "worker not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, ErrWorkerOffline) {
			http.Error(w, "worker is offline, cannot send commands", http.StatusBadRequest)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cmd)
}

// ListCommands returns paginated commands for a worker.
func (h *Handler) ListCommands(w http.ResponseWriter, r *http.Request) {
	workerID := chi.URLParam(r, "workerID")
	if _, err := uuid.Parse(workerID); err != nil {
		http.Error(w, "invalid worker ID", http.StatusBadRequest)
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
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"commands": commands,
		"total":    total,
	})
}
