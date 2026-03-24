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
	handler     *modbus.TCPClientHandler
	client      modbus.Client
	registers   []RegisterConfig
	connected   bool
	backoff     time.Duration
	maxBackoff  time.Duration
	lastAttempt time.Time
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
		m.backoff = time.Duration(math.Min(float64(m.backoff*2), float64(m.maxBackoff)))
		return fmt.Errorf("reconnect failed: %w", err)
	}
	log.Printf("Modbus reconnected to %s", m.handler.Address)
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
		address := ModbusPDUAddress(reg.Address, reg.Type)

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

// ModbusPDUAddress converts a config address to a 0-based PDU address.
// Supports both conventions:
//   - PLC notation: 40001 (holding), 30001 (input), 10001 (coil), 20001 (discrete)
//   - Direct PDU:   0, 1, 2, ... (already 0-based)
func ModbusPDUAddress(address int, regType string) uint16 {
	switch regType {
	case "holding":
		if address >= 400001 {
			return uint16(address - 400001)
		}
		if address >= 40001 {
			return uint16(address - 40001)
		}
	case "input":
		if address >= 300001 {
			return uint16(address - 300001)
		}
		if address >= 30001 {
			return uint16(address - 30001)
		}
	case "coil":
		if address >= 100001 {
			return uint16(address - 100001)
		}
		if address >= 1 && address < 10000 {
			return uint16(address - 1)
		}
	case "discrete":
		if address >= 200001 {
			return uint16(address - 200001)
		}
		if address >= 10001 && address < 20000 {
			return uint16(address - 10001)
		}
	}
	return uint16(address)
}

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
