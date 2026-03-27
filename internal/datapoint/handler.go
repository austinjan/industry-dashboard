package datapoint

import (
	"encoding/json"
	"net/http"

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

func (h *Handler) GetTimeSeries(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	machineID := r.URL.Query().Get("machine_id")
	metric := r.URL.Query().Get("metric")
	timeRange := r.URL.Query().Get("range")
	if machineID == "" || metric == "" {
		apierr.Write(w, r, http.StatusBadRequest, "datapoint.invalid_input", "machine_id and metric required", userID, nil)
		return
	}
	if timeRange == "" {
		timeRange = "24h"
	}
	points, err := h.store.GetTimeSeries(r.Context(), machineID, metric, timeRange)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(points)
}

func (h *Handler) GetMachineMetrics(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	machineID := chi.URLParam(r, "machineID")
	metrics, err := h.store.GetMachineMetrics(r.Context(), machineID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (h *Handler) GetLatestValues(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	machineID := chi.URLParam(r, "machineID")
	values, err := h.store.GetLatestValues(r.Context(), machineID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(values)
}
