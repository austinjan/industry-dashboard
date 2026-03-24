package worker

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type WorkerConfig struct {
	SiteCode     string        `yaml:"site_code"`
	SiteName     string        `yaml:"site_name"`
	Timezone     string        `yaml:"timezone"`
	PollInterval time.Duration `yaml:"poll_interval"`
	Lines        []LineConfig  `yaml:"lines"`
}

type LineConfig struct {
	Name         string          `yaml:"name"`
	DisplayOrder int             `yaml:"display_order"`
	Machines     []MachineConfig `yaml:"machines"`
}

type MachineConfig struct {
	Name       string           `yaml:"name"`
	Model      string           `yaml:"model"`
	Connection ConnectionConfig `yaml:"connection"`
	Registers  []RegisterConfig `yaml:"registers"`
}

type ConnectionConfig struct {
	Host    string        `yaml:"host"`
	Port    int           `yaml:"port"`
	SlaveID int           `yaml:"slave_id"`
	Timeout time.Duration `yaml:"timeout"`
}

type RegisterConfig struct {
	Name      string     `yaml:"name"`
	Address   int        `yaml:"address"`
	Type      string     `yaml:"type"`
	DataType  string     `yaml:"data_type"`
	ByteOrder string     `yaml:"byte_order"`
	Scale     float64    `yaml:"scale"`
	Offset    float64    `yaml:"offset"`
	Unit      string     `yaml:"unit"`
	Fake      FakeConfig `yaml:"fake"`
}

type FakeConfig struct {
	Min     float64 `yaml:"min"`
	Max     float64 `yaml:"max"`
	Pattern string  `yaml:"pattern"`
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
	for i := range cfg.Lines {
		if cfg.Lines[i].DisplayOrder == 0 {
			cfg.Lines[i].DisplayOrder = i + 1
		}
		for j := range cfg.Lines[i].Machines {
			applyMachineDefaults(&cfg.Lines[i].Machines[j])
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
		if r.Fake.Max == 0 && r.Fake.Min == 0 {
			r.Fake.Max = 100
		}
		if r.Fake.Pattern == "" {
			r.Fake.Pattern = "random"
		}
	}
}
