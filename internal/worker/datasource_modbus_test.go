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

func TestModbusPDUAddress(t *testing.T) {
	tests := []struct {
		name     string
		address  int
		regType  string
		expected uint16
	}{
		// Holding registers: 40001 convention
		{"holding PLC 40001", 40001, "holding", 0},
		{"holding PLC 40003", 40003, "holding", 2},
		{"holding PLC 40100", 40100, "holding", 99},
		// Holding registers: 6-digit convention
		{"holding PLC 400001", 400001, "holding", 0},
		// Holding registers: direct PDU
		{"holding direct 0", 0, "holding", 0},
		{"holding direct 5", 5, "holding", 5},
		// Input registers: 30001 convention
		{"input PLC 30001", 30001, "input", 0},
		{"input PLC 30010", 30010, "input", 9},
		{"input direct 0", 0, "input", 0},
		// Coils: 1-based convention (00001)
		{"coil PLC 1", 1, "coil", 0},
		{"coil PLC 100", 100, "coil", 99},
		// Discrete: 10001 convention
		{"discrete PLC 10001", 10001, "discrete", 0},
		{"discrete direct 0", 0, "discrete", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := worker.ModbusPDUAddress(tt.address, tt.regType)
			assert.Equal(t, tt.expected, result)
		})
	}
}
