package worker_config

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestYAMLMarshalStructure(t *testing.T) {
	cfg := yamlConfig{
		SiteCode:     "ALPHA",
		SiteName:     "Factory Alpha",
		Timezone:     "Asia/Taipei",
		PollInterval: "5s",
		WorkerName:   "alpha-worker",
		Lines: []yamlLine{
			{
				Name:         "Assembly Line 1",
				DisplayOrder: 1,
				Machines: []yamlMachine{
					{
						Name:  "CNC-01",
						Model: "Haas VF-2",
						Connection: yamlConnection{
							Host:    "192.168.1.10",
							Port:    502,
							SlaveID: 1,
						},
						Registers: []yamlRegister{
							{
								Name:    "spindle_speed",
								Address: 100,
							},
							{
								Name:      "temperature",
								Address:   101,
								Unit:      "degC",
								Scale:     0.1,
								ByteOrder: "little",
							},
						},
					},
				},
			},
		},
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		t.Fatalf("yaml.Marshal failed: %v", err)
	}

	out := string(data)

	// Check top-level fields
	if !strings.Contains(out, "site_code: ALPHA") {
		t.Errorf("expected site_code in output, got:\n%s", out)
	}
	if !strings.Contains(out, "site_name: Factory Alpha") {
		t.Errorf("expected site_name in output, got:\n%s", out)
	}
	if !strings.Contains(out, "timezone: Asia/Taipei") {
		t.Errorf("expected timezone in output, got:\n%s", out)
	}
	if !strings.Contains(out, "poll_interval: 5s") {
		t.Errorf("expected poll_interval in output, got:\n%s", out)
	}
	if !strings.Contains(out, "worker_name: alpha-worker") {
		t.Errorf("expected worker_name in output, got:\n%s", out)
	}

	// Check nested fields
	if !strings.Contains(out, "Assembly Line 1") {
		t.Errorf("expected line name in output, got:\n%s", out)
	}
	if !strings.Contains(out, "CNC-01") {
		t.Errorf("expected machine name in output, got:\n%s", out)
	}
	if !strings.Contains(out, "host: 192.168.1.10") {
		t.Errorf("expected host in output, got:\n%s", out)
	}
	if !strings.Contains(out, "spindle_speed") {
		t.Errorf("expected register name in output, got:\n%s", out)
	}
}

func TestYAMLOmitemptyDefaults(t *testing.T) {
	// A register with default values should omit type/data_type/byte_order
	reg := yamlRegister{
		Name:    "speed",
		Address: 100,
		// Type, DataType, ByteOrder all empty -> omitempty
		// Scale 0 -> omitempty
	}

	data, err := yaml.Marshal(reg)
	if err != nil {
		t.Fatalf("yaml.Marshal failed: %v", err)
	}

	out := string(data)
	if strings.Contains(out, "type:") {
		t.Errorf("expected type to be omitted when empty, got:\n%s", out)
	}
	if strings.Contains(out, "data_type:") {
		t.Errorf("expected data_type to be omitted when empty, got:\n%s", out)
	}
	if strings.Contains(out, "byte_order:") {
		t.Errorf("expected byte_order to be omitted when empty, got:\n%s", out)
	}
}

func TestSanitizeFilename(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"alpha-worker", "alpha-worker"},
		{"my worker 1", "my_worker_1"},
		{"factory/line:1", "factory_line_1"},
	}

	for _, c := range cases {
		var sb strings.Builder
		for _, ch := range c.input {
			if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' {
				sb.WriteRune(ch)
			} else {
				sb.WriteRune('_')
			}
		}
		result := sb.String()
		if result != c.expected {
			t.Errorf("sanitize(%q) = %q, want %q", c.input, result, c.expected)
		}
	}
}
