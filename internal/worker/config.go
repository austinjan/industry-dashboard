package worker

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type WorkerConfig struct {
	SiteCode     string        `yaml:"site_code" json:"site_code"`
	SiteName     string        `yaml:"site_name" json:"site_name"`
	Timezone     string        `yaml:"timezone" json:"timezone"`
	PollInterval time.Duration `yaml:"poll_interval" json:"poll_interval"`
	Lines        []LineConfig  `yaml:"lines" json:"lines"`
	DatabaseURL  string        `yaml:"database_url" json:"database_url,omitempty"`
	LogLevel     string        `yaml:"log_level" json:"log_level"`
	WorkerName   string        `yaml:"worker_name" json:"worker_name"`
}

type LineConfig struct {
	Name         string          `yaml:"name" json:"name"`
	DisplayOrder int             `yaml:"display_order" json:"display_order"`
	Machines     []MachineConfig `yaml:"machines" json:"machines"`
}

type MachineConfig struct {
	Name       string           `yaml:"name" json:"name"`
	Model      string           `yaml:"model" json:"model,omitempty"`
	Connection ConnectionConfig `yaml:"connection" json:"connection"`
	Registers  []RegisterConfig `yaml:"registers" json:"registers"`
}

type ConnectionConfig struct {
	Host    string        `yaml:"host" json:"host"`
	Port    int           `yaml:"port" json:"port"`
	SlaveID int           `yaml:"slave_id" json:"slave_id"`
	Timeout time.Duration `yaml:"timeout" json:"timeout,omitempty"`
}

type RegisterConfig struct {
	Name      string      `yaml:"name" json:"name"`
	Address   int         `yaml:"address" json:"address"`
	Type      string      `yaml:"type" json:"type,omitempty"`
	DataType  string      `yaml:"data_type" json:"data_type,omitempty"`
	ByteOrder string      `yaml:"byte_order" json:"byte_order,omitempty"`
	Scale     float64     `yaml:"scale" json:"scale,omitempty"`
	Offset    float64     `yaml:"offset" json:"offset,omitempty"`
	Unit      string      `yaml:"unit" json:"unit,omitempty"`
	Length    int         `yaml:"length" json:"length,omitempty"`
	Fake      *FakeConfig `yaml:"fake" json:"fake,omitempty"`
}

type FakeConfig struct {
	Min     float64 `yaml:"min" json:"min"`
	Max     float64 `yaml:"max" json:"max"`
	Pattern string  `yaml:"pattern" json:"pattern"`
}

func LoadConfig(path string) (*WorkerConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}
	var cfg WorkerConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}
	if cfg.SiteCode == "" {
		return nil, fmt.Errorf("site_code is required")
	}
	if cfg.PollInterval == 0 {
		cfg.PollInterval = 5 * time.Second
	}
	if cfg.Timezone == "" {
		cfg.Timezone = "UTC"
	}
	if cfg.SiteName == "" {
		cfg.SiteName = cfg.SiteCode
	}
	if cfg.LogLevel == "" {
		cfg.LogLevel = "info"
	}
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		cfg.DatabaseURL = dbURL
	}
	for i := range cfg.Lines {
		if cfg.Lines[i].DisplayOrder == 0 {
			cfg.Lines[i].DisplayOrder = i + 1
		}
		for j := range cfg.Lines[i].Machines {
			applyMachineDefaults(&cfg.Lines[i].Machines[j])
		}
	}
	// Validate string registers have length
	for i := range cfg.Lines {
		for j := range cfg.Lines[i].Machines {
			for k := range cfg.Lines[i].Machines[j].Registers {
				r := &cfg.Lines[i].Machines[j].Registers[k]
				if r.DataType == "string" && r.Length == 0 {
					return nil, fmt.Errorf("register %q has data_type=string but no length specified", r.Name)
				}
			}
		}
	}
	return &cfg, nil
}

func applyMachineDefaults(m *MachineConfig) {
	if m.Connection.Port == 0 {
		m.Connection.Port = 502
	}
	if m.Connection.SlaveID == 0 {
		m.Connection.SlaveID = 1
	}
	if m.Connection.Timeout == 0 {
		m.Connection.Timeout = 3 * time.Second
	}
	for k := range m.Registers {
		r := &m.Registers[k]
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
		if r.Fake != nil {
			if r.Fake.Max == 0 && r.Fake.Min == 0 {
				r.Fake.Max = 100
			}
			if r.Fake.Pattern == "" {
				r.Fake.Pattern = "random"
			}
		}
	}
}

// ToJSON returns the config as JSON bytes for storage in the database.
func (c *WorkerConfig) ToJSON() ([]byte, error) {
	return json.Marshal(c)
}
