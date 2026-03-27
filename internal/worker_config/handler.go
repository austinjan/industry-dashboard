package worker_config

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/apierr"
	"github.com/industry-dashboard/server/internal/auth"
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
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	configs, err := h.store.ListConfigs(r.Context())
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func (h *Handler) CreateConfig(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	var body struct {
		Name         string `json:"name"`
		SiteID       string `json:"site_id"`
		PollInterval string `json:"poll_interval"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid request", userID, nil)
		return
	}
	if body.Name == "" {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "name is required", userID, nil)
		return
	}
	if body.PollInterval == "" {
		body.PollInterval = "5s"
	}
	cfg, err := h.store.CreateConfig(r.Context(), body.Name, body.SiteID, body.PollInterval)
	if err != nil {
		if isDuplicateKey(err) {
			apierr.Write(w, r, http.StatusConflict, "worker.invalid_input", "config name already exists for this site", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	configID := chi.URLParam(r, "configID")
	cfg, err := h.store.GetConfig(r.Context(), configID)
	if err != nil {
		if err == pgx.ErrNoRows {
			apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "config not found", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	configID := chi.URLParam(r, "configID")
	var body struct {
		Name         string `json:"name"`
		SiteID       string `json:"site_id"`
		PollInterval string `json:"poll_interval"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid request", userID, nil)
		return
	}
	if body.Name == "" {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "name is required", userID, nil)
		return
	}
	if body.PollInterval == "" {
		body.PollInterval = "5s"
	}
	cfg, err := h.store.UpdateConfig(r.Context(), configID, body.Name, body.SiteID, body.PollInterval)
	if err != nil {
		if err == pgx.ErrNoRows {
			apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "config not found", userID, nil)
			return
		}
		if isDuplicateKey(err) {
			apierr.Write(w, r, http.StatusConflict, "worker.invalid_input", "config name already exists for this site", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) DeleteConfig(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	configID := chi.URLParam(r, "configID")
	if err := h.store.DeleteConfig(r.Context(), configID); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SetConfigMachines(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	configID := chi.URLParam(r, "configID")
	var body struct {
		Machines []ConfigMachineInput `json:"machines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "invalid request", userID, nil)
		return
	}
	for _, m := range body.Machines {
		if m.Host == "" {
			apierr.Write(w, r, http.StatusBadRequest, "worker.invalid_input", "host is required for each machine", userID, nil)
			return
		}
	}
	if err := h.store.SetConfigMachines(r.Context(), configID, body.Machines); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	cfg, err := h.store.GetConfig(r.Context(), configID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) ExportYAML(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	configID := chi.URLParam(r, "configID")
	yamlBytes, workerName, err := h.store.GenerateYAML(r.Context(), configID)
	if err != nil {
		if err == pgx.ErrNoRows {
			apierr.Write(w, r, http.StatusNotFound, "worker.not_found", "config not found", userID, nil)
			return
		}
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
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
