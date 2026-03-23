package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ProvisionedMachine struct {
	ID        string
	Name      string
	Registers []RegisterConfig
}

type ProvisionResult struct {
	SiteID   string
	Machines []ProvisionedMachine
}

func Provision(ctx context.Context, db *pgxpool.Pool, cfg *WorkerConfig) (*ProvisionResult, error) {
	result := &ProvisionResult{}

	// Upsert site
	err := db.QueryRow(ctx,
		`INSERT INTO sites (name, code, timezone)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, updated_at = NOW()
		 RETURNING id`,
		cfg.SiteName, cfg.SiteCode, cfg.Timezone,
	).Scan(&result.SiteID)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert site: %w", err)
	}
	log.Printf("Site: %s (id: %s)", cfg.SiteName, result.SiteID)

	for _, lineCfg := range cfg.Lines {
		// Upsert production line
		var lineID string
		err := db.QueryRow(ctx,
			`INSERT INTO production_lines (site_id, name, display_order)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (site_id, name) DO UPDATE SET display_order = EXCLUDED.display_order, updated_at = NOW()
			 RETURNING id`,
			result.SiteID, lineCfg.Name, lineCfg.DisplayOrder,
		).Scan(&lineID)
		if err != nil {
			// Line may already exist, try to find it
			err = db.QueryRow(ctx,
				`SELECT id FROM production_lines WHERE site_id = $1 AND name = $2`,
				result.SiteID, lineCfg.Name,
			).Scan(&lineID)
			if err != nil {
				return nil, fmt.Errorf("failed to upsert line %s: %w", lineCfg.Name, err)
			}
		}
		log.Printf("  Line: %s (id: %s)", lineCfg.Name, lineID)

		for _, machineCfg := range lineCfg.Machines {
			// Build modbus_config JSONB from registers
			modbusConfig := map[string]interface{}{
				"registers": machineCfg.Registers,
			}
			modbusJSON, _ := json.Marshal(modbusConfig)

			var machineID string
			err := db.QueryRow(ctx,
				`INSERT INTO machines (line_id, name, model, status, modbus_config)
				 VALUES ($1, $2, $3, 'running', $4)
				 ON CONFLICT (line_id, name) DO UPDATE SET model = EXCLUDED.model, modbus_config = EXCLUDED.modbus_config, status = 'running', updated_at = NOW()
				 RETURNING id`,
				lineID, machineCfg.Name, machineCfg.Model, modbusJSON,
			).Scan(&machineID)
			if err != nil {
				// Machine may already exist
				err = db.QueryRow(ctx,
					`SELECT id FROM machines WHERE line_id = $1 AND name = $2`,
					lineID, machineCfg.Name,
				).Scan(&machineID)
				if err != nil {
					return nil, fmt.Errorf("failed to upsert machine %s: %w", machineCfg.Name, err)
				}
				// Update modbus config and status
				db.Exec(ctx,
					`UPDATE machines SET modbus_config = $1, status = 'running', updated_at = NOW() WHERE id = $2`,
					modbusJSON, machineID)
			}
			log.Printf("    Machine: %s (id: %s)", machineCfg.Name, machineID)

			result.Machines = append(result.Machines, ProvisionedMachine{
				ID:        machineID,
				Name:      machineCfg.Name,
				Registers: machineCfg.Registers,
			})
		}
	}

	return result, nil
}
