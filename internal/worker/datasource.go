package worker

import (
	"context"
	"fmt"
)

type ReadResult struct {
	Values  map[string]float64
	Strings map[string]string
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

// TODO(Task 4): replace with real Modbus implementation.
func NewModbusDataSource(conn ConnectionConfig, registers []RegisterConfig) (*ModbusDataSource, error) {
	return nil, fmt.Errorf("ModbusDataSource not yet implemented")
}

type ModbusDataSource struct{}

func (m *ModbusDataSource) Read(ctx context.Context) (*ReadResult, error) {
	return &ReadResult{Values: make(map[string]float64), Strings: make(map[string]string)}, nil
}

func (m *ModbusDataSource) Close() error { return nil }
