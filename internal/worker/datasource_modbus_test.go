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
