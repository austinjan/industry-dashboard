package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecodeRegister_Uint16(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "uint16", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x00, 0x64}, cfg)
	require.NoError(t, err)
	assert.Equal(t, 100.0, val)
}

func TestDecodeRegister_Uint16_ScaleOffset(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "uint16", ByteOrder: "big", Scale: 0.1, Offset: -10}
	val, err := worker.DecodeRegister([]byte{0x01, 0xF4}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 40.0, val, 0.001)
}

func TestDecodeRegister_Int16(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "int16", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0xFF, 0x9C}, cfg)
	require.NoError(t, err)
	assert.Equal(t, -100.0, val)
}

func TestDecodeRegister_Uint32_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "uint32", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x00, 0x01, 0x00, 0x00}, cfg)
	require.NoError(t, err)
	assert.Equal(t, 65536.0, val)
}

func TestDecodeRegister_Int32_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "int32", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0xFF, 0xFF, 0xFF, 0x9C}, cfg)
	require.NoError(t, err)
	assert.Equal(t, -100.0, val)
}

func TestDecodeRegister_Float32_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "big", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x42, 0xC8, 0x00, 0x00}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Float64_Big(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float64", ByteOrder: "big", Scale: 1.0}
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
	val, err := worker.DecodeRegister([]byte{0x65, 0xD8, 0xE4, 0x80}, cfg)
	require.NoError(t, err)
	assert.Equal(t, 1708713088.0, val)
}

// Byte order tests — float32 100.0 big-endian = [42 C8 00 00] where A=42 B=C8 C=00 D=00
func TestDecodeRegister_Float32_Little(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "little", Scale: 1.0}
	val, err := worker.DecodeRegister([]byte{0x00, 0x00, 0xC8, 0x42}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Float32_MidBig(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "mid-big", Scale: 1.0}
	// CDAB: swap 16-bit register order. [00,00,42,C8]
	val, err := worker.DecodeRegister([]byte{0x00, 0x00, 0x42, 0xC8}, cfg)
	require.NoError(t, err)
	assert.InDelta(t, 100.0, val, 0.001)
}

func TestDecodeRegister_Float32_MidLittle(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "float32", ByteOrder: "mid-little", Scale: 1.0}
	// BADC: swap bytes within each 16-bit register. [C8,42,00,00]
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
	_, err := worker.DecodeRegister([]byte{0x00, 0x00}, cfg)
	assert.Error(t, err)
}

func TestDecodeString(t *testing.T) {
	cfg := worker.RegisterConfig{DataType: "string", Length: 3}
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
