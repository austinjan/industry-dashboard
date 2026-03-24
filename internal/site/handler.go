package site

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
		if isDuplicateKey(err) {
			http.Error(w, "site code already exists", http.StatusConflict)
			return
		}
		log.Printf("CreateSite error: %v", err)
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

func (h *Handler) ListAllSites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.store.ListAllSites(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sites)
}

func (h *Handler) UpdateSite(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	var body struct {
		Name     string `json:"name"`
		Timezone string `json:"timezone"`
		Address  string `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	site, err := h.store.UpdateSite(r.Context(), siteID, body.Name, body.Timezone, body.Address)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "site not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(site)
}

func (h *Handler) DeleteSite(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	if err := h.store.DeleteSite(r.Context(), siteID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetSiteDetail(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	detail, err := h.store.GetSiteDetail(r.Context(), siteID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "site not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

func (h *Handler) CreateLine(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	var body struct {
		Name         string `json:"name"`
		DisplayOrder int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	line, err := h.store.CreateLine(r.Context(), siteID, body.Name, body.DisplayOrder)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(line)
}

func (h *Handler) UpdateLine(w http.ResponseWriter, r *http.Request) {
	lineID := chi.URLParam(r, "lineID")
	var body struct {
		Name         string `json:"name"`
		DisplayOrder int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	line, err := h.store.UpdateLine(r.Context(), lineID, body.Name, body.DisplayOrder)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "line not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(line)
}

func (h *Handler) DeleteLine(w http.ResponseWriter, r *http.Request) {
	lineID := chi.URLParam(r, "lineID")
	if err := h.store.DeleteLine(r.Context(), lineID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) CreateMachine(w http.ResponseWriter, r *http.Request) {
	lineID := chi.URLParam(r, "lineID")
	var body struct {
		Name    string `json:"name"`
		Model   string `json:"model"`
		Host    string `json:"host"`
		Port    int    `json:"port"`
		SlaveID int    `json:"slave_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	var conn *MachineConnection
	if body.Host != "" {
		conn = &MachineConnection{Host: body.Host, Port: body.Port, SlaveID: body.SlaveID}
	}
	machine, err := h.store.CreateMachine(r.Context(), lineID, body.Name, body.Model, conn)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(machine)
}

func (h *Handler) UpdateMachine(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	var body struct {
		Name    string `json:"name"`
		Model   string `json:"model"`
		Host    string `json:"host"`
		Port    int    `json:"port"`
		SlaveID int    `json:"slave_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	var conn *MachineConnection
	if body.Host != "" {
		conn = &MachineConnection{Host: body.Host, Port: body.Port, SlaveID: body.SlaveID}
	}
	machine, err := h.store.UpdateMachine(r.Context(), machineID, body.Name, body.Model, conn)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "machine not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(machine)
}

func (h *Handler) DeleteMachine(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	if err := h.store.DeleteMachine(r.Context(), machineID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
