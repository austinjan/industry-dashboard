package alert

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/auth"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListAlerts(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id required", http.StatusBadRequest)
		return
	}
	alerts, err := h.store.ListAlerts(r.Context(), siteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

func (h *Handler) ListAlertEvents(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id required", http.StatusBadRequest)
		return
	}
	severity := r.URL.Query().Get("severity")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	events, err := h.store.ListAlertEvents(r.Context(), siteID, severity, limit, offset)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

func (h *Handler) CreateAlert(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name       string  `json:"name"`
		MachineID  string  `json:"machine_id"`
		MetricName string  `json:"metric_name"`
		Condition  string  `json:"condition"`
		Threshold  float64 `json:"threshold"`
		Severity   string  `json:"severity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.MachineID == "" || body.MetricName == "" {
		http.Error(w, "name, machine_id, and metric_name are required", http.StatusBadRequest)
		return
	}
	alert, err := h.store.CreateAlert(r.Context(), body.Name, body.MachineID, body.MetricName, body.Condition, body.Threshold, body.Severity)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(alert)
}

func (h *Handler) AcknowledgeAlertEvent(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "eventID")
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.store.AcknowledgeAlertEvent(r.Context(), eventID, claims.UserID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
