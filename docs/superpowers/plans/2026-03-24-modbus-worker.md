# SP1: Modbus Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Modbus TCP reads to the worker via a DataSource interface, unifying fake and real modes in a single binary.

**Architecture:** Introduce a `DataSource` interface with two implementations (`FakeDataSource` wrapping existing Generator, `ModbusDataSource` using goburrow/modbus). The Runner calls `source.Read()` instead of `Generator.GenerateFor()` directly. A new `cmd/worker/main.go` auto-detects mode per machine based on whether `fake:` config blocks are present (`*FakeConfig` pointer: nil = real Modbus).

**Tech Stack:** Go, github.com/goburrow/modbus, pgx, TimescaleDB

**Spec:** `docs/superpowers/specs/2026-03-24-modbus-worker-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `internal/worker/datasource.go` | `DataSource` interface + `NewDataSource()` factory |
| `internal/worker/datasource_fake.go` | `FakeDataSource` — wraps Generator |
| `internal/worker/datasource_fake_test.go` | Unit tests for FakeDataSource |
| `internal/worker/decoder.go` | `DecodeRegister()` — byte-to-value decoding for all types/byte-orders |
| `internal/worker/decoder_test.go` | Unit tests for all decoding paths |
| `internal/worker/datasource_modbus.go` | `ModbusDataSource` — real Modbus TCP client |
| `internal/worker/datasource_modbus_test.go` | Unit tests for ModbusDataSource (mocked TCP) |
| `cmd/worker/main.go` | Unified worker entry point |
| `migrations/013_create_machine_metadata.up.sql` | `machine_metadata` table DDL |
| `migrations/013_create_machine_metadata.down.sql` | Drop `machine_metadata` table |

### Modified Files
| File | Changes |
|------|---------|
| `internal/worker/config.go` | `FakeConfig` → `*FakeConfig`, add `DatabaseURL`/`LogLevel`/`WorkerName`/`Length` fields, fix defaults |
| `internal/worker/provisioner.go` | Add `DataSource` field to `ProvisionedMachine`, call `NewDataSource()` |
| `internal/worker/runner.go` | Replace Generator calls with `source.Read()`, add error counting + machine status updates, batch writes |
| `go.mod` | Add `github.com/goburrow/modbus` |
| `Makefile` | Add `worker` and `worker-config` targets |

---

## Task 1: Config Changes — FakeConfig Pointer + New Fields

**Files:**
- Modify: `internal/worker/config.go:39-55` (RegisterConfig, FakeConfig)
- Modify: `internal/worker/config.go:89-120` (applyMachineDefaults)
- Modify: `internal/worker/generator_test.go` (ensure tests still pass)

- [ ] **Step 1: Change FakeConfig to pointer in RegisterConfig**

In `internal/worker/config.go`, change line 48:
```go
// Before:
Fake      FakeConfig `yaml:"fake"`

// After:
Fake      *FakeConfig `yaml:"fake"`
```

- [ ] **Step 2: Add new top-level config fields and Length field**

In `internal/worker/config.go`, add to `WorkerConfig`:
```go
type WorkerConfig struct {
	DatabaseURL  string        `yaml:"database_url"`
	LogLevel     string        `yaml:"log_level"`
	WorkerName   string        `yaml:"worker_name"`
	SiteCode     string        `yaml:"site_code"`
	SiteName     string        `yaml:"site_name"`
	Timezone     string        `yaml:"timezone"`
	PollInterval time.Duration `yaml:"poll_interval"`
	Lines        []LineConfig  `yaml:"lines"`
}
```

Add `Length` to `RegisterConfig`:
```go
type RegisterConfig struct {
	Name      string      `yaml:"name"`
	Address   int         `yaml:"address"`
	Type      string      `yaml:"type"`
	DataType  string      `yaml:"data_type"`
	ByteOrder string      `yaml:"byte_order"`
	Scale     float64     `yaml:"scale"`
	Offset    float64     `yaml:"offset"`
	Unit      string      `yaml:"unit"`
	Length    int         `yaml:"length"`
	Fake      *FakeConfig `yaml:"fake"`
}
```

- [ ] **Step 3: Fix applyMachineDefaults to only apply fake defaults when Fake != nil**

Replace lines 113-118 in `applyMachineDefaults`:
```go
// Before:
if r.Fake.Max == 0 && r.Fake.Min == 0 {
    r.Fake.Max = 100
}
if r.Fake.Pattern == "" {
    r.Fake.Pattern = "random"
}

// After:
if r.Fake != nil {
    if r.Fake.Max == 0 && r.Fake.Min == 0 {
        r.Fake.Max = 100
    }
    if r.Fake.Pattern == "" {
        r.Fake.Pattern = "random"
    }
}
```

- [ ] **Step 4: Add database_url resolution in LoadConfig**

Add after existing validation in `LoadConfig`:
```go
if cfg.LogLevel == "" {
    cfg.LogLevel = "info"
}
// database_url: env var takes priority over YAML
if envDB := os.Getenv("DATABASE_URL"); envDB != "" {
    cfg.DatabaseURL = envDB
}
// Validate string registers have length
for i := range cfg.Lines {
    for j := range cfg.Lines[i].Machines {
        for k := range cfg.Lines[i].Machines[j].Registers {
            r := &cfg.Lines[i].Machines[j].Registers[k]
            if r.DataType == "string" && r.Length == 0 {
                return nil, fmt.Errorf("register %s on machine %s: data_type=string requires length field",
                    r.Name, cfg.Lines[i].Machines[j].Name)
            }
        }
    }
}
```

- [ ] **Step 5: Verify runner.go compiles with pointer change**

No code change needed in `runner.go` at this point. Line 43 accesses `reg.Fake.Pattern` etc. — Go auto-dereferences the pointer, so this compiles as-is. The entire Runner will be rewritten in Task 5.

- [ ] **Step 6: Run tests to verify nothing broke**

Run: `go test ./internal/worker/ -v`
Expected: All 5 generator tests pass. Compilation succeeds.

- [ ] **Step 7: Run full build**

Run: `go build ./...`
Expected: Clean build, no errors.

- [ ] **Step 8: Commit**

```bash
git add internal/worker/config.go internal/worker/runner.go
git commit -m "refactor: change FakeConfig to pointer, add config fields for unified worker"
```

---

## Task 2: Register Decoder

**Files:**
- Create: `internal/worker/decoder.go`
- Create: `internal/worker/decoder_test.go`

- [ ] **Step 1: Write failing tests for uint16 decoding**

Create `internal/worker/decoder_test.go`:
```go
package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecodeRegister_Uint16(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "uint16", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x00, 0x64}, cfg) // 100
	require.NoError(t, err)
	assert.Equal(t, 100.0, val)
}

func TestDecodeRegister_Uint16_ScaleOffset(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "uint16", ByteOrder: "big", Scale: 0.1, Offset: -10}
	val, err := worker.DecodeRegister([]byte{0x01, 0xF4}, cfg) // 500 * 0.1 + (-10) = 40
	require.NoError(t, err)
	assert.InDelta(t, 40.0, val, 0.001)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/worker/ -run TestDecodeRegister -v`
Expected: FAIL — `DecodeRegister` not defined.

- [ ] **Step 3: Write failing tests for int16, int32, uint32, float32, float64**

Add to `decoder_test.go`:
```go
func TestDecodeRegister_Int16(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "int16", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0xFF, 0x9C}, cfg) // -100
	require.NoError(t, err)
	assert.Equal(t, -100.0, val)
}

func TestDecodeRegister_Uint32_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "uint32", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x00, 0x01, 0x00, 0x00}, cfg) // 65536
	require.NoError(t, err)
	assert.Equal(t, 65536.0, val)
}

func TestDecodeRegister_Int32_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "int32", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0xFF, 0xFF, 0xFF, 0x9C}, cfg) // -100
	require.NoError(t, err)
	assert.Equal(t, -100.0, val)
}

func TestDecodeRegister_Float32_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "big", Scale: 1.0}
	// IEEE 754: 42 C8 00 00 = 100.0
	val, err := worker.DecodeRegister([]byte{0x42, 0xC8, 0x00, 0x00}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Float64_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float64", ByteOrder: "big", Scale: 1.0}
	// IEEE 754: 40 59 00 00 00 00 00 00 = 100.0
	val, err := worker.DecodeRegister([]byte{0x40, 0x59, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Bool(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "bool", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x01}, cfg)
	require.NoError(t, err)
	assert.Equal(t, 1.0, val)

	val, err = worker.DecodeRegister([]byte{0x00}, cfg)
	require.NoError(t, err)
	assert.Equal(t, 0.0, val)
}

func TestDecodeRegister_TimestampUnix(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "timestamp_unix", ByteOrder: "big", Scale: 1.0}
	// 0x65D8E480 = 1708786816
	val, err := worker.DecodeRegister([]byte{0x65, 0xD8, 0xE4, 0x80}, cfg)
	require.NoError(t, err)
	assert.Equal(t, 1708786816.0, val)
}
```

- [ ] **Step 4: Write failing tests for byte order variants**

Add to `decoder_test.go`:
```go
func TestDecodeRegister_Float32_Little(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "little", Scale: 1.0}
	// Little-endian of 42 C8 00 00 = 00 00 C8 42
	val, err := worker.DecodeRegister([]byte{0x00, 0x00, 0xC8, 0x42}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Float32_MidBig(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "mid-big", Scale: 1.0}
	// Big-endian [A,B,C,D] = [42,C8,00,00]. Mid-big (CDAB) = [00,00,42,C8]
	val, err := worker.DecodeRegister([]byte{0x00, 0x00, 0x42, 0xC8}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Float32_MidLittle(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "mid-little", Scale: 1.0}
	// Big-endian [A,B,C,D] = [42,C8,00,00]. Mid-little (BADC) = [C8,42,00,00]
	val, err := worker.DecodeRegister([]byte{0xC8, 0x42, 0x00, 0x00}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_UnsupportedType(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "unknown", Scale: 1.0}
	_, err := worker.DecodeRegister([]byte{0x00}, cfg)
	assert.Error(t, err)
}

func TestDecodeRegister_WrongSize(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "big", Scale: 1.0}
	_, err := worker.DecodeRegister([]byte{0x00, 0x00}, cfg) // need 4 bytes, got 2
	assert.Error(t, err)
}
```

Byte-order reference for float32 100.0 (big-endian = `42 C8 00 00`), where A=0x42, B=0xC8, C=0x00, D=0x00:
- **big:** `[42, C8, 00, 00]` — `[A, B, C, D]`
- **little:** `[00, 00, C8, 42]` — `[D, C, B, A]`
- **mid-big (CDAB):** `[00, 00, 42, C8]` — swap 16-bit register order
- **mid-little (BADC):** `[C8, 42, 00, 00]` — swap bytes within each 16-bit register

- [ ] **Step 5: Write DecodeString failing test**

Add to `decoder_test.go`:
```go
func TestDecodeString(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "string", Length: 3}
	// 3 registers = 6 bytes = "Hello\x00"
	raw := []byte{0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x00}
	str, err := worker.DecodeString(raw, cfg)
	require.NoError(t, err)
	assert.Equal(t, "Hello", str)
}

func TestDecodeString_NullPadded(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "string", Length: 5}
	raw := []byte{0x41, 0x42, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
	str, err := worker.DecodeString(raw, cfg)
	require.NoError(t, err)
	assert.Equal(t, "ABC", str)
}
```

- [ ] **Step 6: Implement decoder.go**

Create `internal/worker/decoder.go`:
```go
package worker

import (
	"encoding/binary"
	"fmt"
	"math"
	"strings"
)

func DecodeRegister(raw []byte, cfg RegisterConfig) (float64, error) {
	if cfg.Scale == 0 {
		cfg.Scale = 1.0
	}

	switch cfg.DataType {
	case "bool":
		if len(raw) < 1 {
			return 0, fmt.Errorf("bool requires at least 1 byte, got %d", len(raw))
		}
		if raw[0] != 0 {
			return (1.0 * cfg.Scale) + cfg.Offset, nil
		}
		return (0.0 * cfg.Scale) + cfg.Offset, nil

	case "uint16":
		if len(raw) < 2 {
			return 0, fmt.Errorf("uint16 requires 2 bytes, got %d", len(raw))
		}
		v := float64(binary.BigEndian.Uint16(raw))
		return v*cfg.Scale + cfg.Offset, nil

	case "int16":
		if len(raw) < 2 {
			return 0, fmt.Errorf("int16 requires 2 bytes, got %d", len(raw))
		}
		v := float64(int16(binary.BigEndian.Uint16(raw)))
		return v*cfg.Scale + cfg.Offset, nil

	case "uint32":
		ordered, err := applyByteOrder(raw, 4, cfg.ByteOrder)
		if err != nil {
			return 0, err
		}
		v := float64(binary.BigEndian.Uint32(ordered))
		return v*cfg.Scale + cfg.Offset, nil

	case "int32":
		ordered, err := applyByteOrder(raw, 4, cfg.ByteOrder)
		if err != nil {
			return 0, err
		}
		v := float64(int32(binary.BigEndian.Uint32(ordered)))
		return v*cfg.Scale + cfg.Offset, nil

	case "float32":
		ordered, err := applyByteOrder(raw, 4, cfg.ByteOrder)
		if err != nil {
			return 0, err
		}
		bits := binary.BigEndian.Uint32(ordered)
		v := float64(math.Float32frombits(bits))
		return v*cfg.Scale + cfg.Offset, nil

	case "float64":
		ordered, err := applyByteOrder(raw, 8, cfg.ByteOrder)
		if err != nil {
			return 0, err
		}
		bits := binary.BigEndian.Uint64(ordered)
		v := math.Float64frombits(bits)
		return v*cfg.Scale + cfg.Offset, nil

	case "timestamp_unix":
		ordered, err := applyByteOrder(raw, 4, cfg.ByteOrder)
		if err != nil {
			return 0, err
		}
		v := float64(binary.BigEndian.Uint32(ordered))
		return v*cfg.Scale + cfg.Offset, nil

	default:
		return 0, fmt.Errorf("unsupported data_type: %s", cfg.DataType)
	}
}

func DecodeString(raw []byte, cfg RegisterConfig) (string, error) {
	if cfg.DataType != "string" {
		return "", fmt.Errorf("DecodeString called with data_type=%s", cfg.DataType)
	}
	s := string(raw)
	s = strings.TrimRight(s, "\x00")
	return s, nil
}

// applyByteOrder reorders raw bytes from the given byte order to big-endian.
func applyByteOrder(raw []byte, size int, order string) ([]byte, error) {
	if len(raw) < size {
		return nil, fmt.Errorf("expected %d bytes, got %d", size, len(raw))
	}
	data := make([]byte, size)
	copy(data, raw[:size])

	switch order {
	case "big", "":
		// Already big-endian, no reorder needed
		return data, nil
	case "little":
		// Full byte reversal
		for i, j := 0, len(data)-1; i < j; i, j = i+1, j-1 {
			data[i], data[j] = data[j], data[i]
		}
		return data, nil
	case "mid-big":
		// CDAB: swap 16-bit register order, keep bytes within registers
		if size == 4 {
			return []byte{data[2], data[3], data[0], data[1]}, nil
		}
		if size == 8 {
			return []byte{data[6], data[7], data[4], data[5], data[2], data[3], data[0], data[1]}, nil
		}
		return data, nil
	case "mid-little":
		// BADC: swap bytes within each 16-bit register, keep register order
		for i := 0; i+1 < len(data); i += 2 {
			data[i], data[i+1] = data[i+1], data[i]
		}
		return data, nil
	default:
		return nil, fmt.Errorf("unsupported byte_order: %s", order)
	}
}
```

- [ ] **Step 7: Run decoder tests**

Run: `go test ./internal/worker/ -run TestDecode -v`
Expected: All tests pass. If byte-order tests fail, fix the test values using the reference table in Step 4.

- [ ] **Step 8: Commit**

```bash
git add internal/worker/decoder.go internal/worker/decoder_test.go
git commit -m "feat: add register decoder with all data types and byte orders"
```

---

## Task 3: DataSource Interface + FakeDataSource

**Files:**
- Create: `internal/worker/datasource.go`
- Create: `internal/worker/datasource_fake.go`
- Create: `internal/worker/datasource_fake_test.go`

- [ ] **Step 1: Write failing tests for FakeDataSource**

Create `internal/worker/datasource_fake_test.go`:
```go
package worker_test

import (
	"context"
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFakeDataSource_Read(t *testing.T) {
	regs := []worker.RegisterConfig{
		{Name: "temperature", Fake: &worker.FakeConfig{Min: 60, Max: 95, Pattern: "random"}},
		{Name: "speed", Fake: &worker.FakeConfig{Min: 80, Max: 150, Pattern: "sine"}},
	}
	src := worker.NewFakeDataSource(regs)
	defer src.Close()

	result, err := src.Read(context.Background())
	require.NoError(t, err)
	assert.Len(t, result.Values, 2)
	assert.GreaterOrEqual(t, result.Values["temperature"], 60.0)
	assert.LessOrEqual(t, result.Values["temperature"], 95.0)
	assert.GreaterOrEqual(t, result.Values["speed"], 80.0)
	assert.LessOrEqual(t, result.Values["speed"], 150.0)
}

func TestFakeDataSource_TickAdvances(t *testing.T) {
	regs := []worker.RegisterConfig{
		{Name: "counter", Fake: &worker.FakeConfig{Min: 0, Max: 10000, Pattern: "monotonic"}},
	}
	src := worker.NewFakeDataSource(regs)
	defer src.Close()

	r1, _ := src.Read(context.Background())
	r2, _ := src.Read(context.Background())
	assert.GreaterOrEqual(t, r2.Values["counter"], r1.Values["counter"])
}

func TestFakeDataSource_SkipsStringRegisters(t *testing.T) {
	regs := []worker.RegisterConfig{
		{Name: "temperature", Fake: &worker.FakeConfig{Min: 60, Max: 95, Pattern: "random"}},
		{Name: "serial", DataType: "string", Length: 5, Fake: &worker.FakeConfig{}},
	}
	src := worker.NewFakeDataSource(regs)
	defer src.Close()

	result, err := src.Read(context.Background())
	require.NoError(t, err)
	assert.Len(t, result.Values, 1) // string register excluded from float64 map
	assert.Contains(t, result.Values, "temperature")
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/worker/ -run TestFakeDataSource -v`
Expected: FAIL — types not defined.

- [ ] **Step 3: Create DataSource interface**

Create `internal/worker/datasource.go`:
```go
package worker

import (
	"context"
	"fmt"
)

// ReadResult holds both numeric and string values from a read cycle.
type ReadResult struct {
	Values  map[string]float64 // numeric register values
	Strings map[string]string  // string register values (for machine_metadata)
}

type DataSource interface {
	Read(ctx context.Context) (*ReadResult, error)
	Close() error
}

func NewDataSource(machine MachineConfig) (DataSource, error) {
	allFake := true
	allReal := true
	for _, reg := range machine.Registers {
		if reg.Fake != nil {
			allReal = false
		} else {
			allFake = false
		}
	}

	if !allFake && !allReal {
		return nil, fmt.Errorf("machine %s has mixed fake/real registers, not supported", machine.Name)
	}

	if allFake {
		return NewFakeDataSource(machine.Registers), nil
	}

	return NewModbusDataSource(machine.Connection, machine.Registers)
}
```

- [ ] **Step 4: Create FakeDataSource**

Create `internal/worker/datasource_fake.go`:
```go
package worker

import "context"

type FakeDataSource struct {
	gen       *Generator
	registers []RegisterConfig
	tick      int
}

func NewFakeDataSource(registers []RegisterConfig) *FakeDataSource {
	return &FakeDataSource{
		gen:       NewGenerator(),
		registers: registers,
	}
}

func (f *FakeDataSource) Read(ctx context.Context) (*ReadResult, error) {
	result := &ReadResult{
		Values:  make(map[string]float64),
		Strings: make(map[string]string),
	}
	for _, reg := range f.registers {
		if reg.DataType == "string" {
			continue // FakeDataSource does not generate string values
		}
		if reg.Fake == nil {
			continue
		}
		result.Values[reg.Name] = f.gen.GenerateFor(reg.Name, reg.Fake.Pattern, reg.Fake.Min, reg.Fake.Max, f.tick)
	}
	f.tick++
	return result, nil
}

func (f *FakeDataSource) Close() error {
	return nil
}
```

- [ ] **Step 5: Create a stub NewModbusDataSource (returns error for now)**

Add a temporary stub at the bottom of `datasource.go`:
```go
func NewModbusDataSource(conn ConnectionConfig, registers []RegisterConfig) (*ModbusDataSource, error) {
	return nil, fmt.Errorf("ModbusDataSource not yet implemented")
}

type ModbusDataSource struct{}
func (m *ModbusDataSource) Read(ctx context.Context) (*ReadResult, error) { return &ReadResult{Values: make(map[string]float64), Strings: make(map[string]string)}, nil }
func (m *ModbusDataSource) Close() error { return nil }
```
This stub will be replaced in Task 4. It allows the code to compile and `NewDataSource` factory to work.

- [ ] **Step 6: Run tests**

Run: `go test ./internal/worker/ -run TestFakeDataSource -v`
Expected: All 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add internal/worker/datasource.go internal/worker/datasource_fake.go internal/worker/datasource_fake_test.go
git commit -m "feat: add DataSource interface and FakeDataSource implementation"
```

---

## Task 4: ModbusDataSource

**Files:**
- Create: `internal/worker/datasource_modbus.go` (replaces stub from Task 3)
- Create: `internal/worker/datasource_modbus_test.go`
- Modify: `internal/worker/datasource.go` (remove stub)
- Modify: `go.mod` (add goburrow/modbus)

- [ ] **Step 1: Add goburrow/modbus dependency**

Run: `go get github.com/goburrow/modbus`

- [ ] **Step 2: Write failing tests for ModbusDataSource**

Create `internal/worker/datasource_modbus_test.go`:
```go
package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
)

func TestNewModbusDataSource_ValidConfig(t *testing.T) {
	conn := worker.ConnectionConfig{
		Host:    "127.0.0.1",
		Port:    5020,
		SlaveID: 1,
	}
	regs := []worker.RegisterConfig{
		{Name: "temperature", Address: 40001, Type: "holding", DataType: "float32", ByteOrder: "big", Scale: 1.0},
	}
	src, err := worker.NewModbusDataSource(conn, regs)
	assert.NoError(t, err)
	assert.NotNil(t, src)
	src.Close()
}

func TestModbusDataSource_RegisterCountCalc(t *testing.T) {
	tests := []struct {
		dataType string
		expected uint16
	}{
		{"uint16", 1},
		{"int16", 1},
		{"uint32", 2},
		{"int32", 2},
		{"float32", 2},
		{"float64", 4},
		{"timestamp_unix", 2},
	}
	for _, tt := range tests {
		t.Run(tt.dataType, func(t *testing.T) {
			count := worker.RegisterCount(tt.dataType, 0)
			assert.Equal(t, tt.expected, count)
		})
	}
}

func TestModbusDataSource_RegisterCountString(t *testing.T) {
	count := worker.RegisterCount("string", 10)
	assert.Equal(t, uint16(10), count)
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `go test ./internal/worker/ -run TestModbus -v`
Expected: FAIL.

- [ ] **Step 4: Implement ModbusDataSource**

Create `internal/worker/datasource_modbus.go`:
```go
package worker

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/goburrow/modbus"
)

type ModbusDataSource struct {
	handler      *modbus.TCPClientHandler
	client       modbus.Client
	registers    []RegisterConfig
	connected    bool
	backoff      time.Duration
	maxBackoff   time.Duration
	lastAttempt  time.Time
}

func NewModbusDataSource(conn ConnectionConfig, registers []RegisterConfig) (*ModbusDataSource, error) {
	handler := modbus.NewTCPClientHandler(fmt.Sprintf("%s:%d", conn.Host, conn.Port))
	handler.SlaveId = byte(conn.SlaveID)
	if conn.Timeout > 0 {
		handler.Timeout = conn.Timeout
	} else {
		handler.Timeout = 3 * time.Second
	}

	return &ModbusDataSource{
		handler:    handler,
		client:     modbus.NewClient(handler),
		registers:  registers,
		backoff:    1 * time.Second,
		maxBackoff: 30 * time.Second,
	}, nil
}

func (m *ModbusDataSource) connect() error {
	if err := m.handler.Connect(); err != nil {
		return err
	}
	m.connected = true
	m.backoff = 1 * time.Second
	return nil
}

func (m *ModbusDataSource) reconnect() error {
	now := time.Now()
	if now.Sub(m.lastAttempt) < m.backoff {
		return fmt.Errorf("backing off, next attempt in %s", m.backoff-now.Sub(m.lastAttempt))
	}
	m.lastAttempt = now

	m.handler.Close()
	if err := m.connect(); err != nil {
		// Increase backoff
		m.backoff = time.Duration(math.Min(float64(m.backoff*2), float64(m.maxBackoff)))
		return fmt.Errorf("reconnect failed: %w", err)
	}
	log.Printf("Modbus reconnected to %s:%d", m.handler.Address, m.handler.SlaveId)
	return nil
}

func (m *ModbusDataSource) Read(ctx context.Context) (*ReadResult, error) {
	if !m.connected {
		if err := m.reconnect(); err != nil {
			return nil, err
		}
	}

	result := &ReadResult{
		Values:  make(map[string]float64),
		Strings: make(map[string]string),
	}
	for _, reg := range m.registers {
		count := RegisterCount(reg.DataType, reg.Length)
		address := uint16(reg.Address)

		var raw []byte
		var err error

		switch reg.Type {
		case "holding":
			raw, err = m.client.ReadHoldingRegisters(address, count)
		case "input":
			raw, err = m.client.ReadInputRegisters(address, count)
		case "coil":
			raw, err = m.client.ReadCoils(address, 1)
		case "discrete":
			raw, err = m.client.ReadDiscreteInputs(address, 1)
		default:
			return nil, fmt.Errorf("unsupported register type: %s", reg.Type)
		}

		if err != nil {
			m.connected = false
			return nil, fmt.Errorf("read %s (addr=%d) failed: %w", reg.Name, reg.Address, err)
		}

		if reg.DataType == "string" {
			str, err := DecodeString(raw, reg)
			if err != nil {
				return nil, fmt.Errorf("decode string %s failed: %w", reg.Name, err)
			}
			result.Strings[reg.Name] = str
			continue
		}

		val, err := DecodeRegister(raw, reg)
		if err != nil {
			return nil, fmt.Errorf("decode %s failed: %w", reg.Name, err)
		}
		result.Values[reg.Name] = val
	}

	return result, nil
}

func (m *ModbusDataSource) Close() error {
	if m.handler != nil {
		m.handler.Close()
	}
	return nil
}

// RegisterCount returns the number of 16-bit Modbus registers needed for a data type.
func RegisterCount(dataType string, length int) uint16 {
	switch dataType {
	case "uint16", "int16":
		return 1
	case "uint32", "int32", "float32", "timestamp_unix":
		return 2
	case "float64":
		return 4
	case "bool":
		return 1
	case "string":
		return uint16(length)
	default:
		return 1
	}
}
```

- [ ] **Step 5: Remove the ModbusDataSource stub from datasource.go**

In `internal/worker/datasource.go`, remove the `NewModbusDataSource` stub, `type ModbusDataSource struct{}`, and the stub methods that were added in Task 3 Step 5.

- [ ] **Step 6: Run tests**

Run: `go test ./internal/worker/ -run "TestModbus|TestNewModbus" -v`
Expected: All tests pass.

- [ ] **Step 7: Run full test suite**

Run: `go test ./internal/worker/ -v`
Expected: All tests pass (generator + decoder + datasource).

- [ ] **Step 8: Commit**

```bash
git add internal/worker/datasource.go internal/worker/datasource_modbus.go internal/worker/datasource_modbus_test.go go.mod go.sum
git commit -m "feat: add ModbusDataSource with TCP client and reconnection backoff"
```

---

## Task 5: Refactor Runner to Use DataSource

**Files:**
- Modify: `internal/worker/runner.go` (full rewrite of RunMachine)
- Modify: `internal/worker/provisioner.go:12-16` (add DataSource to ProvisionedMachine)

- [ ] **Step 1: Add DataSource field to ProvisionedMachine**

In `internal/worker/provisioner.go`, change:
```go
// Before (line 12-16):
type ProvisionedMachine struct {
	ID        string
	Name      string
	Registers []RegisterConfig
}

// After:
type ProvisionedMachine struct {
	ID         string
	Name       string
	Registers  []RegisterConfig
	DataSource DataSource
}
```

- [ ] **Step 2: Rewrite Runner.RunMachine to use DataSource**

Replace the entire `RunMachine` method in `internal/worker/runner.go`:
```go
func (r *Runner) RunMachine(ctx context.Context, machine ProvisionedMachine) {
	log.Printf("Starting data collection for %s", machine.Name)
	if machine.DataSource == nil {
		log.Printf("ERROR: no DataSource for %s, skipping", machine.Name)
		return
	}
	defer machine.DataSource.Close()

	ticker := time.NewTicker(r.pollInterval)
	defer ticker.Stop()

	consecutiveErrors := 0

	for {
		select {
		case <-ctx.Done():
			log.Printf("Stopping %s", machine.Name)
			return
		case <-ticker.C:
			result, err := machine.DataSource.Read(ctx)
			if err != nil {
				consecutiveErrors++
				log.Printf("Error reading %s: %v (consecutive: %d)", machine.Name, err, consecutiveErrors)
				if consecutiveErrors >= 3 {
					r.updateMachineStatus(ctx, machine.ID, "error")
				}
				continue
			}
			consecutiveErrors = 0
			r.updateMachineStatus(ctx, machine.ID, "running")
			r.writeDataPoints(ctx, machine.ID, result.Values)
			if len(result.Strings) > 0 {
				r.writeStringMetadata(ctx, machine.ID, result.Strings)
			}
			r.alertEval.Evaluate(ctx, machine.ID, result.Values)
		}
	}
}

func (r *Runner) updateMachineStatus(ctx context.Context, machineID, status string) {
	_, err := r.db.Exec(ctx,
		`UPDATE machines SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, machineID,
	)
	if err != nil {
		log.Printf("Error updating machine %s status: %v", machineID, err)
	}
}

func (r *Runner) writeDataPoints(ctx context.Context, machineID string, values map[string]float64) {
	for metricName, value := range values {
		_, err := r.db.Exec(ctx,
			`INSERT INTO data_points (time, machine_id, metric_name, value) VALUES (NOW(), $1, $2, $3)`,
			machineID, metricName, value,
		)
		if err != nil {
			log.Printf("Error writing %s/%s: %v", machineID, metricName, err)
		}
	}
}

func (r *Runner) writeStringMetadata(ctx context.Context, machineID string, strings map[string]string) {
	for key, value := range strings {
		_, err := r.db.Exec(ctx,
			`INSERT INTO machine_metadata (machine_id, key, value, updated_at)
			 VALUES ($1, $2, $3, NOW())
			 ON CONFLICT (machine_id, key) DO UPDATE
			 SET value = EXCLUDED.value, updated_at = NOW()
			 WHERE machine_metadata.value != EXCLUDED.value`,
			machineID, key, value,
		)
		if err != nil {
			log.Printf("Error writing metadata %s/%s: %v", machineID, key, err)
		}
	}
}
```

Also remove unused imports (`math/rand`) and the `rng`, `gen`, `tick` variables from the old implementation.

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`
Expected: Clean build. The `cmd/fake-worker/main.go` still compiles because it doesn't set `DataSource` on `ProvisionedMachine` yet — the Runner will skip machines with nil DataSource (safe fallback).

- [ ] **Step 4: Commit**

```bash
git add internal/worker/runner.go internal/worker/provisioner.go
git commit -m "refactor: runner uses DataSource interface instead of direct Generator calls"
```

---

## Task 6: Machine Metadata Migration

**Files:**
- Create: `migrations/013_create_machine_metadata.up.sql`
- Create: `migrations/013_create_machine_metadata.down.sql`

- [ ] **Step 1: Check highest migration number**

Run: `ls migrations/ | sort | tail -2`
Expected: See current highest number (should be 012).

- [ ] **Step 2: Create up migration**

Create `migrations/013_create_machine_metadata.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS machine_metadata (
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    key        VARCHAR(255) NOT NULL,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (machine_id, key)
);
```

- [ ] **Step 3: Create down migration**

Create `migrations/013_create_machine_metadata.down.sql`:
```sql
DROP TABLE IF EXISTS machine_metadata;
```

- [ ] **Step 4: Commit**

```bash
git add migrations/013_create_machine_metadata.up.sql migrations/013_create_machine_metadata.down.sql
git commit -m "feat: add machine_metadata table for string register values"
```

---

## Task 7: Unified Worker Binary

**Files:**
- Create: `cmd/worker/main.go`
- Modify: `Makefile`

- [ ] **Step 1: Create cmd/worker/main.go**

Create `cmd/worker/main.go`:
```go
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/worker"
)

func main() {
	configPath := flag.String("config", "cmd/worker/config.yaml", "Path to worker config YAML")
	flag.Parse()

	workerCfg, err := worker.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Loaded config: site=%s, lines=%d, poll=%s",
		workerCfg.SiteCode, len(workerCfg.Lines), workerCfg.PollInterval)

	// Resolve database URL: env var > YAML config > app config fallback
	dbURL := workerCfg.DatabaseURL
	if dbURL == "" {
		appCfg := config.Load()
		dbURL = appCfg.DatabaseURL
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := database.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	result, err := worker.Provision(ctx, pool, workerCfg)
	if err != nil {
		log.Fatalf("Failed to provision: %v", err)
	}

	// Create DataSource for each machine
	for i, m := range result.Machines {
		// Find the MachineConfig for this provisioned machine
		machineCfg := findMachineConfig(workerCfg, m.Name)
		if machineCfg == nil {
			log.Fatalf("Machine config not found for %s", m.Name)
		}
		ds, err := worker.NewDataSource(*machineCfg)
		if err != nil {
			log.Fatalf("Failed to create data source for %s: %v", m.Name, err)
		}
		result.Machines[i].DataSource = ds
	}
	log.Printf("Provisioned %d machines", len(result.Machines))

	coordinator := worker.NewCoordinator(pool)
	machineIDs := make([]string, len(result.Machines))
	for i, m := range result.Machines {
		machineIDs[i] = m.ID
	}
	if err := coordinator.ClaimMachines(ctx, machineIDs); err != nil {
		log.Fatalf("Failed to claim machines: %v", err)
	}

	go coordinator.StartHeartbeat(ctx, machineIDs)

	runner := worker.NewRunner(pool, workerCfg.PollInterval)
	var wg sync.WaitGroup
	for _, machine := range result.Machines {
		wg.Add(1)
		go func(m worker.ProvisionedMachine) {
			defer wg.Done()
			runner.RunMachine(ctx, m)
		}(machine)
	}

	log.Printf("Worker running (worker_id: %s). Press Ctrl+C to stop.", coordinator.WorkerID())

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	cancel()
	wg.Wait()
	coordinator.ReleaseMachines(context.Background(), machineIDs)
	log.Println("Done.")
}

func findMachineConfig(cfg *worker.WorkerConfig, name string) *worker.MachineConfig {
	for _, line := range cfg.Lines {
		for i, m := range line.Machines {
			if m.Name == name {
				return &line.Machines[i]
			}
		}
	}
	return nil
}
```

- [ ] **Step 2: Add Makefile targets**

Append to `Makefile`:
```makefile

worker:
	go run ./cmd/worker

worker-config:
	go run ./cmd/worker -config $(CONFIG)
```

Also update the `.PHONY` line at the top to include `worker worker-config`.

- [ ] **Step 3: Verify compilation**

Run: `go build ./cmd/worker`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add cmd/worker/main.go Makefile
git commit -m "feat: add unified worker binary with auto-detection of fake/modbus mode"
```

---

## Task 8: Update Fake Worker for Backwards Compatibility

**Files:**
- Modify: `cmd/fake-worker/main.go`

- [ ] **Step 1: Update fake-worker to use DataSource**

The fake worker should still work but now use the DataSource path. Update `cmd/fake-worker/main.go` to create `FakeDataSource` for each machine:

After `result, err := worker.Provision(...)` and before the coordinator, add:
```go
// Attach FakeDataSource to each machine
for i, m := range result.Machines {
    machineCfg := findMachineConfig(workerCfg, m.Name)
    if machineCfg == nil {
        log.Fatalf("Machine config not found for %s", m.Name)
    }
    ds, err := worker.NewDataSource(*machineCfg)
    if err != nil {
        log.Fatalf("Failed to create data source for %s: %v", m.Name, err)
    }
    result.Machines[i].DataSource = ds
}
```

Add the `findMachineConfig` helper (same as in `cmd/worker/main.go`).

Remove the existing `appCfg := config.Load()` usage — use the same DB URL resolution pattern as the unified worker (or keep it simple since fake-worker always uses env var).

- [ ] **Step 2: Run fake-worker build**

Run: `go build ./cmd/fake-worker`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add cmd/fake-worker/main.go
git commit -m "refactor: update fake-worker to use DataSource interface"
```

---

## Task 9: Integration Verification

- [ ] **Step 1: Run full test suite**

Run: `go test ./... -v`
Expected: All tests pass (generator, decoder, datasource).

- [ ] **Step 2: Build all binaries**

Run: `go build ./...`
Expected: Clean build — server, worker, fake-worker all compile.

- [ ] **Step 3: Verify fake-worker config still loads**

Run: `go run ./cmd/worker -config cmd/fake-worker/config.yaml 2>&1 | head -5`
Expected: Config loads, shows site=ALPHA. It will fail on DB connect (no DB running) — that's expected. The point is config parsing works.

- [ ] **Step 4: Commit any fixes**

If any issues were found, fix and commit.

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Config changes (FakeConfig pointer, new fields) | None |
| 2 | Register decoder (all types + byte orders) | None |
| 3 | DataSource interface + FakeDataSource | Task 1 |
| 4 | ModbusDataSource (goburrow/modbus) | Task 2, Task 3 |
| 5 | Refactor Runner to use DataSource | Task 3 |
| 6 | Machine metadata migration | None |
| 7 | Unified worker binary (cmd/worker) | Task 4, Task 5 |
| 8 | Update fake-worker for backwards compat | Task 5 |
| 9 | Integration verification | All |

Tasks 1, 2, and 6 can be done in parallel. Tasks 3 depends on 1. Task 4 depends on 2 and 3. Task 5 depends on 3. Tasks 7 and 8 depend on 4 and 5. Task 9 is final verification.
