"""Modbus TCP simulator for testing the worker.

Serves static register values on port 5020 (configurable via --port).

Holding registers (PLC notation / PDU address):
  40001 / 0:  temperature (float32) = 72.5
  40003 / 2:  speed (uint16) = 1200
  40004 / 3:  power (float32) = 3.75

Usage:
  python3 modbus-simulator.py
  python3 modbus-simulator.py --port 5020
"""
import argparse
import struct
import logging
from pymodbus.server import StartTcpServer
from pymodbus.datastore import (
    ModbusSlaveContext,
    ModbusServerContext,
    ModbusSequentialDataBlock,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def build_registers():
    """Build holding register block with test values."""
    # float32 72.5 -> two 16-bit registers
    temp_regs = struct.unpack(">HH", struct.pack(">f", 72.5))
    # uint16 1200
    speed_reg = 1200
    # float32 3.75 -> two 16-bit registers
    power_regs = struct.unpack(">HH", struct.pack(">f", 3.75))

    values = list(temp_regs) + [speed_reg] + list(power_regs)
    values.extend([0] * (100 - len(values)))
    return values


def main():
    parser = argparse.ArgumentParser(description="Modbus TCP simulator")
    parser.add_argument("--port", type=int, default=5020, help="TCP port (default: 5020)")
    args = parser.parse_args()

    values = build_registers()

    # pymodbus zero_mode=False (default) adds +1 offset to incoming addresses,
    # so data block starts at address 1 to align with 0-based PDU addresses.
    store = ModbusSlaveContext(
        hr=ModbusSequentialDataBlock(1, values),
        ir=ModbusSequentialDataBlock(1, [0] * 100),
        di=ModbusSequentialDataBlock(1, [0] * 100),
        co=ModbusSequentialDataBlock(1, [0] * 100),
    )
    context = ModbusServerContext(slaves=store, single=True)

    log.info("Modbus TCP simulator starting on port %d", args.port)
    log.info("  40001 (addr 0-1): temperature = 72.5 (float32)")
    log.info("  40003 (addr 2):   speed = 1200 (uint16)")
    log.info("  40004 (addr 3-4): power = 3.75 (float32)")
    log.info("Press Ctrl+C to stop")

    StartTcpServer(context=context, address=("0.0.0.0", args.port))


if __name__ == "__main__":
    main()
