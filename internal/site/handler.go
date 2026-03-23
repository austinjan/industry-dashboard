package site

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

func (h *Handler) ListSites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.store.ListSites(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sites)
}

func (h *Handler) CreateSite(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Code     string `json:"code"`
		Timezone string `json:"timezone"`
		Address  string `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.Code == "" {
		http.Error(w, "name and code are required", http.StatusBadRequest)
		return
	}
	if body.Timezone == "" {
		body.Timezone = "UTC"
	}
	site, err := h.store.CreateSite(r.Context(), body.Name, body.Code, body.Timezone, body.Address)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(site)
}

func (h *Handler) ListLines(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	lines, err := h.store.ListLinesBySite(r.Context(), siteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lines)
}

func (h *Handler) GetSite(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	site, err := h.store.GetSite(r.Context(), siteID)
	if err != nil {
		http.Error(w, "site not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(site)
}

func (h *Handler) GetSiteSummary(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	summary, err := h.store.GetSiteSummary(r.Context(), siteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

func (h *Handler) ListMachines(w http.ResponseWriter, r *http.Request) {
	lineID := chi.URLParam(r, "lineID")
	machines, err := h.store.ListMachinesByLine(r.Context(), lineID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(machines)
}
