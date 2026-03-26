package worker_config

import (
	"context"
	"encoding/json"

	"gopkg.in/yaml.v3"
)

// register mirrors site.Register for JSONB parsing (avoids import cycle).
type register struct {
	Name      string      `json:"name"`
	Address   int         `json:"address"`
	Type      string      `json:"type"`
	DataType  string      `json:"data_type"`
	Unit      string      `json:"unit"`
	Scale     float64     `json:"scale"`
	Offset    float64     `json:"offset"`
	ByteOrder string      `json:"byte_order"`
	Fake      *fakeConfig `json:"fake,omitempty"`
}

type fakeConfig struct {
	Min     float64 `json:"min"`
	Max     float64 `json:"max"`
	Pattern string  `json:"pattern"`
}

type yamlConfig struct {
	SiteCode     string     `yaml:"site_code"`
	SiteName     string     `yaml:"site_name"`
	Timezone     string     `yaml:"timezone"`
	PollInterval string     `yaml:"poll_interval"`
	WorkerName   string     `yaml:"worker_name"`
	Lines        []yamlLine `yaml:"lines"`
}

type yamlLine struct {
	Name         string        `yaml:"name"`
	DisplayOrder int           `yaml:"display_order,omitempty"`
	Machines     []yamlMachine `yaml:"machines"`
}

type yamlMachine struct {
	Name       string           `yaml:"name"`
	Model      string           `yaml:"model,omitempty"`
	Connection yamlConnection   `yaml:"connection"`
	Registers  []yamlRegister   `yaml:"registers,omitempty"`
}

type yamlConnection struct {
	Host    string `yaml:"host"`
	Port    int    `yaml:"port"`
	SlaveID int    `yaml:"slave_id"`
}

type yamlRegister struct {
	Name      string    `yaml:"name"`
	Address   int       `yaml:"address"`
	Type      string    `yaml:"type,omitempty"`
	DataType  string    `yaml:"data_type,omitempty"`
	Unit      string    `yaml:"unit,omitempty"`
	Scale     float64   `yaml:"scale,omitempty"`
	Offset    float64   `yaml:"offset,omitempty"`
	ByteOrder string    `yaml:"byte_order,omitempty"`
	Fake      *yamlFake `yaml:"fake,omitempty"`
}

type yamlFake struct {
	Min     float64 `yaml:"min"`
	Max     float64 `yaml:"max"`
	Pattern string  `yaml:"pattern"`
}

// GenerateYAML builds a YAML config for the given worker config ID.
// Returns (yamlBytes, workerName, error).
func (s *Store) GenerateYAML(ctx context.Context, configID string) ([]byte, string, error) {
	cfg, err := s.GetConfig(ctx, configID)
	if err != nil {
		return nil, "", err
	}

	// Get timezone from site
	var siteTimezone string
	err = s.db.QueryRow(ctx, `SELECT COALESCE(timezone, 'UTC') FROM sites WHERE id=$1`, cfg.SiteID).Scan(&siteTimezone)
	if err != nil {
		siteTimezone = "UTC"
	}

	// Build line map to group machines by line
	type lineKey struct {
		name string
	}
	lineMap := make(map[string]*yamlLine)
	lineOrder := []string{}

	for _, m := range cfg.Machines {
		if _, exists := lineMap[m.LineName]; !exists {
			lineMap[m.LineName] = &yamlLine{
				Name:     m.LineName,
				Machines: []yamlMachine{},
			}
			lineOrder = append(lineOrder, m.LineName)
		}

		// Load registers for this machine from modbus_config
		var registersJSON []byte
		err := s.db.QueryRow(ctx,
			`SELECT modbus_config->'registers' FROM machines WHERE id=$1`, m.MachineID,
		).Scan(&registersJSON)
		if err != nil {
			registersJSON = nil
		}

		var registers []register
		if registersJSON != nil {
			json.Unmarshal(registersJSON, &registers)
		}

		var yamlRegs []yamlRegister
		for _, reg := range registers {
			yr := yamlRegister{
				Name:    reg.Name,
				Address: reg.Address,
			}
			if reg.Type != "" && reg.Type != "holding" {
				yr.Type = reg.Type
			}
			if reg.DataType != "" && reg.DataType != "float32" {
				yr.DataType = reg.DataType
			}
			if reg.Unit != "" {
				yr.Unit = reg.Unit
			}
			if reg.Scale != 0 && reg.Scale != 1.0 {
				yr.Scale = reg.Scale
			}
			if reg.Offset != 0 {
				yr.Offset = reg.Offset
			}
			if reg.ByteOrder != "" && reg.ByteOrder != "big" {
				yr.ByteOrder = reg.ByteOrder
			}
			if reg.Fake != nil {
				yr.Fake = &yamlFake{
					Min:     reg.Fake.Min,
					Max:     reg.Fake.Max,
					Pattern: reg.Fake.Pattern,
				}
			}
			yamlRegs = append(yamlRegs, yr)
		}

		ym := yamlMachine{
			Name:  m.MachineName,
			Model: m.Model,
			Connection: yamlConnection{
				Host:    m.Host,
				Port:    m.Port,
				SlaveID: m.SlaveID,
			},
			Registers: yamlRegs,
		}
		lineMap[m.LineName].Machines = append(lineMap[m.LineName].Machines, ym)
	}

	lines := make([]yamlLine, 0, len(lineOrder))
	for i, name := range lineOrder {
		l := lineMap[name]
		l.DisplayOrder = i + 1
		lines = append(lines, *l)
	}

	out := yamlConfig{
		SiteCode:     cfg.SiteCode,
		SiteName:     cfg.SiteName,
		Timezone:     siteTimezone,
		PollInterval: cfg.PollInterval,
		WorkerName:   cfg.Name,
		Lines:        lines,
	}

	data, err := yaml.Marshal(out)
	if err != nil {
		return nil, "", err
	}
	return data, cfg.Name, nil
}
