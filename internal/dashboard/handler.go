package dashboard

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/rbac"
)

type Handler struct {
	store     *Store
	rbacStore *rbac.Store
}

func NewHandler(store *Store, rbacStore *rbac.Store) *Handler {
	return &Handler{store: store, rbacStore: rbacStore}
}

func (h *Handler) ListDashboards(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id required", http.StatusBadRequest)
		return
	}

	isAdmin, _ := h.rbacStore.IsGlobalAdmin(r.Context(), claims.UserID)

	// Get user's role IDs at this site
	roles, _ := h.rbacStore.GetUserRolesAtSite(r.Context(), claims.UserID, siteID)
	roleIDs := make([]string, len(roles))
	for i, r := range roles {
		roleIDs[i] = r
	}

	dashboards, err := h.store.ListDashboards(r.Context(), claims.UserID, siteID, roleIDs, isAdmin)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboards)
}

func (h *Handler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "dashboardID")
	dashboard, err := h.store.GetDashboard(r.Context(), id)
	if err != nil {
		http.Error(w, "dashboard not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

func (h *Handler) CreateDashboard(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	var body struct {
		Title  string `json:"title"`
		SiteID string `json:"site_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Title == "" || body.SiteID == "" {
		http.Error(w, "title and site_id required", http.StatusBadRequest)
		return
	}
	dashboard, err := h.store.CreateDashboard(r.Context(), body.Title, claims.UserID, body.SiteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dashboard)
}

func (h *Handler) UpdateDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "dashboardID")
	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := h.store.UpdateDashboard(r.Context(), id, body.Title); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "dashboardID")
	if err := h.store.DeleteDashboard(r.Context(), id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SaveWidgets(w http.ResponseWriter, r *http.Request) {
	dashboardID := chi.URLParam(r, "dashboardID")
	var body struct {
		Widgets []Widget `json:"widgets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := h.store.SaveWidgets(r.Context(), dashboardID, body.Widgets); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetAccess(w http.ResponseWriter, r *http.Request) {
	dashboardID := chi.URLParam(r, "dashboardID")
	access, err := h.store.GetAccess(r.Context(), dashboardID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(access)
}

func (h *Handler) SetAccess(w http.ResponseWriter, r *http.Request) {
	dashboardID := chi.URLParam(r, "dashboardID")
	var body struct {
		Access []RoleAccess `json:"access"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := h.store.SetAccess(r.Context(), dashboardID, body.Access); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListWidgetTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.store.ListWidgetTypes(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(types)
}
