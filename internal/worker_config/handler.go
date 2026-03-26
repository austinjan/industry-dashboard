package worker_config

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func isDuplicateKey(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := h.store.ListConfigs(r.Context())
	if err != nil {
		log.Printf("ListConfigs error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func (h *Handler) CreateConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string `json:"name"`
		SiteID       string `json:"site_id"`
		PollInterval string `json:"poll_interval"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if body.PollInterval == "" {
		body.PollInterval = "5s"
	}
	cfg, err := h.store.CreateConfig(r.Context(), body.Name, body.SiteID, body.PollInterval)
	if err != nil {
		if isDuplicateKey(err) {
			http.Error(w, "config name already exists for this site", http.StatusConflict)
			return
		}
		log.Printf("CreateConfig error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	configID := chi.URLParam(r, "configID")
	cfg, err := h.store.GetConfig(r.Context(), configID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "config not found", http.StatusNotFound)
			return
		}
		log.Printf("GetConfig error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	configID := chi.URLParam(r, "configID")
	var body struct {
		Name         string `json:"name"`
		SiteID       string `json:"site_id"`
		PollInterval string `json:"poll_interval"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if body.PollInterval == "" {
		body.PollInterval = "5s"
	}
	cfg, err := h.store.UpdateConfig(r.Context(), configID, body.Name, body.SiteID, body.PollInterval)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "config not found", http.StatusNotFound)
			return
		}
		if isDuplicateKey(err) {
			http.Error(w, "config name already exists for this site", http.StatusConflict)
			return
		}
		log.Printf("UpdateConfig error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) DeleteConfig(w http.ResponseWriter, r *http.Request) {
	configID := chi.URLParam(r, "configID")
	if err := h.store.DeleteConfig(r.Context(), configID); err != nil {
		log.Printf("DeleteConfig error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SetConfigMachines(w http.ResponseWriter, r *http.Request) {
	configID := chi.URLParam(r, "configID")
	var body struct {
		Machines []ConfigMachineInput `json:"machines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	for _, m := range body.Machines {
		if m.Host == "" {
			http.Error(w, "host is required for each machine", http.StatusBadRequest)
			return
		}
	}
	if err := h.store.SetConfigMachines(r.Context(), configID, body.Machines); err != nil {
		log.Printf("SetConfigMachines error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	cfg, err := h.store.GetConfig(r.Context(), configID)
	if err != nil {
		log.Printf("GetConfig after SetConfigMachines error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) ExportYAML(w http.ResponseWriter, r *http.Request) {
	configID := chi.URLParam(r, "configID")
	yamlBytes, workerName, err := h.store.GenerateYAML(r.Context(), configID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "config not found", http.StatusNotFound)
			return
		}
		log.Printf("ExportYAML error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Sanitize worker name for filename
	var sb strings.Builder
	for _, ch := range workerName {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' {
			sb.WriteRune(ch)
		} else {
			sb.WriteRune('_')
		}
	}
	filename := sb.String() + ".yaml"

	w.Header().Set("Content-Type", "application/x-yaml")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Write(yamlBytes)
}
