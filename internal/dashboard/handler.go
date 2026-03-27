package dashboard

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/apierr"
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
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		apierr.Write(w, r, http.StatusBadRequest, "dashboard.invalid_input", "site_id required", userID, nil)
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
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboards)
}

func (h *Handler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	id := chi.URLParam(r, "dashboardID")
	dashboard, err := h.store.GetDashboard(r.Context(), id)
	if err != nil {
		apierr.Write(w, r, http.StatusNotFound, "dashboard.not_found", "dashboard not found", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

func (h *Handler) CreateDashboard(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	var body struct {
		Title  string `json:"title"`
		SiteID string `json:"site_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "dashboard.invalid_input", "invalid request", userID, nil)
		return
	}
	if body.Title == "" || body.SiteID == "" {
		apierr.Write(w, r, http.StatusBadRequest, "dashboard.invalid_input", "title and site_id required", userID, nil)
		return
	}
	dashboard, err := h.store.CreateDashboard(r.Context(), body.Title, claims.UserID, body.SiteID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dashboard)
}

func (h *Handler) UpdateDashboard(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	id := chi.URLParam(r, "dashboardID")
	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "dashboard.invalid_input", "invalid request", userID, nil)
		return
	}
	if err := h.store.UpdateDashboard(r.Context(), id, body.Title); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteDashboard(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	id := chi.URLParam(r, "dashboardID")
	if err := h.store.DeleteDashboard(r.Context(), id); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SaveWidgets(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	dashboardID := chi.URLParam(r, "dashboardID")
	var body struct {
		Widgets []Widget `json:"widgets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "dashboard.invalid_input", "invalid request", userID, nil)
		return
	}
	if err := h.store.SaveWidgets(r.Context(), dashboardID, body.Widgets); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetAccess(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	dashboardID := chi.URLParam(r, "dashboardID")
	access, err := h.store.GetAccess(r.Context(), dashboardID)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(access)
}

func (h *Handler) SetAccess(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	dashboardID := chi.URLParam(r, "dashboardID")
	var body struct {
		Access []RoleAccess `json:"access"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "dashboard.invalid_input", "invalid request", userID, nil)
		return
	}
	if err := h.store.SetAccess(r.Context(), dashboardID, body.Access); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListWidgetTypes(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	types, err := h.store.ListWidgetTypes(r.Context())
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(types)
}
