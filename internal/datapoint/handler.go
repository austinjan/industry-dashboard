package datapoint

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) GetTimeSeries(w http.ResponseWriter, r *http.Request) {
	machineID := r.URL.Query().Get("machine_id")
	metric := r.URL.Query().Get("metric")
	timeRange := r.URL.Query().Get("range")
	if machineID == "" || metric == "" {
		http.Error(w, "machine_id and metric required", http.StatusBadRequest)
		return
	}
	if timeRange == "" {
		timeRange = "24h"
	}
	points, err := h.store.GetTimeSeries(r.Context(), machineID, metric, timeRange)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(points)
}

func (h *Handler) GetMachineMetrics(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	metrics, err := h.store.GetMachineMetrics(r.Context(), machineID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (h *Handler) GetLatestValues(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	values, err := h.store.GetLatestValues(r.Context(), machineID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(values)
}
