package alert

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/apierr"
	"github.com/industry-dashboard/server/internal/auth"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListAlerts(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "site_id required", userID, nil)
		return
	}
	alerts, err := h.store.ListAlerts(r.Context(), siteID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

func (h *Handler) ListAlertEvents(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "site_id required", userID, nil)
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	p := AlertEventListParams{
		SiteID:    siteID,
		Severity:  q.Get("severity"),
		Status:    q.Get("status"),
		LineID:    q.Get("line_id"),
		MachineID: q.Get("machine_id"),
		SortBy:    q.Get("sort_by"),
		SortOrder: q.Get("sort_order"),
		Limit:     limit,
		Offset:    offset,
	}
	if sinceStr := q.Get("since"); sinceStr != "" {
		if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			p.Since = t
		}
	}
	result, err := h.store.ListAlertEvents(r.Context(), p)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) CreateAlert(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	var body struct {
		Name       string  `json:"name"`
		MachineID  string  `json:"machine_id"`
		MetricName string  `json:"metric_name"`
		Condition  string  `json:"condition"`
		Threshold  float64 `json:"threshold"`
		Severity   string  `json:"severity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "invalid request", userID, nil)
		return
	}
	if body.Name == "" || body.MachineID == "" || body.MetricName == "" {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "name, machine_id, and metric_name are required", userID, nil)
		return
	}
	alert, err := h.store.CreateAlert(r.Context(), body.Name, body.MachineID, body.MetricName, body.Condition, body.Threshold, body.Severity)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(alert)
}

func (h *Handler) AcknowledgeAlertEvent(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		apierr.Write(w, r, http.StatusUnauthorized, "alert.invalid_request", "unauthorized", "", nil)
		return
	}
	eventID := chi.URLParam(r, "eventID")
	if err := h.store.AcknowledgeAlertEvent(r.Context(), eventID, claims.UserID); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", claims.UserID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UpdateAlert(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
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
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "invalid request body", userID, nil)
		return
	}
	if body.Name == "" {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "name is required", userID, nil)
		return
	}
	alert, err := h.store.UpdateAlert(r.Context(), id, body.Name, body.MetricName, body.Condition, body.Threshold, body.Severity, body.IsActive)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to update alert", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alert)
}

func (h *Handler) DeleteAlert(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	id := chi.URLParam(r, "alertID")
	if err := h.store.DeleteAlert(r.Context(), id); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to delete alert", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) BulkAlertAction(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	var body struct {
		IDs    []string `json:"ids"`
		Action string   `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "invalid request body", userID, nil)
		return
	}
	if len(body.IDs) == 0 {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "ids is required", userID, nil)
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
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "invalid action: must be enable, disable, or delete", userID, nil)
		return
	}
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "bulk action failed", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"affected": count})
}

func (h *Handler) AcknowledgeInfoEvents(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		apierr.Write(w, r, http.StatusBadRequest, "alert.invalid_input", "site_id is required", userID, nil)
		return
	}
	if claims == nil {
		apierr.Write(w, r, http.StatusUnauthorized, "alert.invalid_request", "unauthorized", "", nil)
		return
	}
	count, err := h.store.AcknowledgeInfoEvents(r.Context(), siteID, claims.UserID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to acknowledge info events", claims.UserID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"acknowledged": count})
}
