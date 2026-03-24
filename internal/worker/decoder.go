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

func applyByteOrder(raw []byte, size int, order string) ([]byte, error) {
	if len(raw) < size {
		return nil, fmt.Errorf("expected %d bytes, got %d", size, len(raw))
	}
	data := make([]byte, size)
	copy(data, raw[:size])

	switch order {
	case "big", "":
		return data, nil
	case "little":
		for i, j := 0, len(data)-1; i < j; i, j = i+1, j-1 {
			data[i], data[j] = data[j], data[i]
		}
		return data, nil
	case "mid-big":
		// CDAB: swap 16-bit register order
		if size == 4 {
			return []byte{data[2], data[3], data[0], data[1]}, nil
		}
		if size == 8 {
			return []byte{data[6], data[7], data[4], data[5], data[2], data[3], data[0], data[1]}, nil
		}
		return data, nil
	case "mid-little":
		// BADC: swap bytes within each 16-bit register
		for i := 0; i+1 < len(data); i += 2 {
			data[i], data[i+1] = data[i+1], data[i]
		}
		return data, nil
	default:
		return nil, fmt.Errorf("unsupported byte_order: %s", order)
	}
}
