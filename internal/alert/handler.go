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
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	result, err := h.store.ListAlertEvents(r.Context(), AlertEventListParams{
		SiteID:    siteID,
		Severity:  q.Get("severity"),
		Status:    q.Get("status"),
		LineID:    q.Get("line_id"),
		MachineID: q.Get("machine_id"),
		SortBy:    q.Get("sort_by"),
		SortOrder: q.Get("sort_order"),
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
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

func (h *Handler) UpdateAlert(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "alertID")
	var body struct {
		Name       string  `json:"name"`
		MetricName string  `json:"metric_name"`
		Condition  string  `json:"condition"`
		Threshold  float64 `json:"threshold"`
		Severity   string  `json:"severity"`
		IsActive   bool    `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	alert, err := h.store.UpdateAlert(r.Context(), id, body.Name, body.MetricName, body.Condition, body.Threshold, body.Severity, body.IsActive)
	if err != nil {
		http.Error(w, "failed to update alert", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alert)
}

func (h *Handler) DeleteAlert(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "alertID")
	if err := h.store.DeleteAlert(r.Context(), id); err != nil {
		http.Error(w, "failed to delete alert", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) BulkAlertAction(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs    []string `json:"ids"`
		Action string   `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(body.IDs) == 0 {
		http.Error(w, "ids is required", http.StatusBadRequest)
		return
	}
	var count int64
	var err error
	switch body.Action {
	case "enable":
		count, err = h.store.BulkUpdateAlerts(r.Context(), body.IDs, true)
	case "disable":
		count, err = h.store.BulkUpdateAlerts(r.Context(), body.IDs, false)
	case "delete":
		count, err = h.store.BulkDeleteAlerts(r.Context(), body.IDs)
	default:
		http.Error(w, "invalid action: must be enable, disable, or delete", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "bulk action failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"affected": count})
}

func (h *Handler) AcknowledgeInfoEvents(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id is required", http.StatusBadRequest)
		return
	}
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	count, err := h.store.AcknowledgeInfoEvents(r.Context(), siteID, claims.UserID)
	if err != nil {
		http.Error(w, "failed to acknowledge info events", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"acknowledged": count})
}
