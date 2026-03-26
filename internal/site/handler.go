package site

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
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

var validRegTypes = map[string]bool{
	"holding":  true,
	"input":    true,
	"coil":     true,
	"discrete": true,
}

var validDataTypes = map[string]bool{
	"uint16":        true,
	"int16":         true,
	"uint32":        true,
	"int32":         true,
	"float32":       true,
	"float64":       true,
	"bool":          true,
	"string":        true,
	"timestamp_unix": true,
}

var validByteOrders = map[string]bool{
	"big":        true,
	"little":     true,
	"mid-big":    true,
	"mid-little": true,
}

func applyRegisterDefaults(r *Register) {
	if r.Type == "" {
		r.Type = "holding"
	}
	if r.DataType == "" {
		r.DataType = "float32"
	}
	if r.ByteOrder == "" {
		r.ByteOrder = "big"
	}
	if r.Scale == 0 {
		r.Scale = 1.0
	}
}

func validateRegister(r *Register) error {
	if r.Name == "" {
		return fmt.Errorf("name is required")
	}
	if r.Address < 0 {
		return fmt.Errorf("address must be non-negative")
	}
	if !validRegTypes[r.Type] {
		return fmt.Errorf("invalid type %q: must be one of holding, input, coil, discrete", r.Type)
	}
	if !validDataTypes[r.DataType] {
		return fmt.Errorf("invalid data_type %q", r.DataType)
	}
	if !validByteOrders[r.ByteOrder] {
		return fmt.Errorf("invalid byte_order %q: must be one of big, little, mid-big, mid-little", r.ByteOrder)
	}
	return nil
}

func (h *Handler) GetRegisters(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	registers, err := h.store.GetMachineRegisters(r.Context(), machineID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "machine not found", http.StatusNotFound)
			return
		}
		log.Printf("GetRegisters error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"registers": registers})
}

func (h *Handler) SetRegisters(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	var body struct {
		Registers []Register `json:"registers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	for i := range body.Registers {
		applyRegisterDefaults(&body.Registers[i])
		if err := validateRegister(&body.Registers[i]); err != nil {
			http.Error(w, fmt.Sprintf("register[%d]: %v", i, err), http.StatusBadRequest)
			return
		}
	}
	if err := h.store.SetMachineRegisters(r.Context(), machineID, body.Registers); err != nil {
		log.Printf("SetRegisters error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"registers": body.Registers})
}

func (h *Handler) ListSiteMachines(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id is required", http.StatusBadRequest)
		return
	}
	machines, err := h.store.ListMachinesBySite(r.Context(), siteID)
	if err != nil {
		http.Error(w, "failed to list machines", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(machines)
}

func (h *Handler) GetRegisterMetrics(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	metrics, err := h.store.ListMachineRegisterMetrics(r.Context(), machineID)
	if err != nil {
		metrics = []RegisterMetric{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (h *Handler) ImportRegistersCSV(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	reader := csv.NewReader(strings.NewReader(string(body)))
	reader.TrimLeadingSpace = true

	headers, err := reader.Read()
	if err != nil {
		http.Error(w, "failed to parse CSV header", http.StatusBadRequest)
		return
	}

	// Build column index map
	colIdx := make(map[string]int)
	for i, h := range headers {
		colIdx[strings.TrimSpace(h)] = i
	}

	var registers []Register
	var validationErrors []string
	rowNum := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			http.Error(w, fmt.Sprintf("CSV parse error: %v", err), http.StatusBadRequest)
			return
		}
		rowNum++

		getCol := func(name string) string {
			idx, ok := colIdx[name]
			if !ok || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}

		var reg Register
		reg.Name = getCol("name")

		addrStr := getCol("address")
		if addrStr != "" {
			addr, err := strconv.Atoi(addrStr)
			if err != nil {
				validationErrors = append(validationErrors, fmt.Sprintf("row %d: invalid address %q", rowNum, addrStr))
				continue
			}
			reg.Address = addr
		}

		reg.Type = getCol("type")
		reg.DataType = getCol("data_type")
		reg.Unit = getCol("unit")
		reg.ByteOrder = getCol("byte_order")

		scaleStr := getCol("scale")
		if scaleStr != "" {
			scale, err := strconv.ParseFloat(scaleStr, 64)
			if err != nil {
				validationErrors = append(validationErrors, fmt.Sprintf("row %d: invalid scale %q", rowNum, scaleStr))
				continue
			}
			reg.Scale = scale
		}

		offsetStr := getCol("offset")
		if offsetStr != "" {
			offset, err := strconv.ParseFloat(offsetStr, 64)
			if err != nil {
				validationErrors = append(validationErrors, fmt.Sprintf("row %d: invalid offset %q", rowNum, offsetStr))
				continue
			}
			reg.Offset = offset
		}

		applyRegisterDefaults(&reg)
		if err := validateRegister(&reg); err != nil {
			validationErrors = append(validationErrors, fmt.Sprintf("row %d: %v", rowNum, err))
			continue
		}
		registers = append(registers, reg)
	}

	if len(validationErrors) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"errors": validationErrors})
		return
	}

	if registers == nil {
		registers = []Register{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"registers": registers})
}
