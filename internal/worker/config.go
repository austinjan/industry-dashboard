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
	Name      string           `yaml:"name"`
	Model     string           `yaml:"model"`
	Registers []RegisterConfig `yaml:"registers"`
}

type RegisterConfig struct {
	Name    string  `yaml:"name"`
	Min     float64 `yaml:"min"`
	Max     float64 `yaml:"max"`
	Unit    string  `yaml:"unit"`
	Pattern string  `yaml:"pattern"` // drift | sine | random | spike
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
			for k := range cfg.Lines[i].Machines[j].Registers {
				if cfg.Lines[i].Machines[j].Registers[k].Pattern == "" {
					cfg.Lines[i].Machines[j].Registers[k].Pattern = "random"
				}
			}
		}
	}
	return &cfg, nil
}
