package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/worker"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "cmd/worker/config.yaml", "Path to worker config YAML")
	flag.Parse()

	absConfigPath, _ := filepath.Abs(*configPath)

	workerCfg, err := worker.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Loaded config: site=%s, lines=%d, poll=%s",
		workerCfg.SiteCode, len(workerCfg.Lines), workerCfg.PollInterval)

	// Convert config to JSON for upload to DB
	configJSON, err := workerCfg.ToJSON()
	if err != nil {
		log.Fatalf("Failed to serialize config: %v", err)
	}

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

	coordinator := worker.NewCoordinator(pool, workerCfg.WorkerName, absConfigPath, configJSON, version)

	if err := coordinator.Register(ctx); err != nil {
		log.Fatalf("Failed to register worker: %v", err)
	}

	result, err := worker.Provision(ctx, pool, workerCfg)
	if err != nil {
		log.Fatalf("Failed to provision: %v", err)
	}

	// Create DataSource for each machine
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
	log.Printf("Provisioned %d machines", len(result.Machines))

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
		machineCtx, machineCancel := context.WithCancel(ctx)
		coordinator.StoreMachineCancel(machine.Name, machineCancel)
		wg.Add(1)
		go func(m worker.ProvisionedMachine, mCtx context.Context) {
			defer wg.Done()
			runner.RunMachine(mCtx, m)
		}(machine, machineCtx)
	}

	commandHandler := func(cmdCtx context.Context, command string, params []byte) error {
		switch command {
		case "stop":
			log.Println("Received stop command")
			cancel()
			wg.Wait()
			coordinator.ReleaseMachines(context.Background(), machineIDs)
			coordinator.SetOffline(context.Background())
			log.Println("Worker stopped by command")
			os.Exit(0)
		case "restart":
			log.Println("Received restart command")
			cancel()
			wg.Wait()
			coordinator.ReleaseMachines(context.Background(), machineIDs)
			executable, err := os.Executable()
			if err != nil {
				return fmt.Errorf("failed to get executable path: %w", err)
			}
			log.Println("Re-executing worker process...")
			if err := syscall.Exec(executable, os.Args, os.Environ()); err != nil {
				return fmt.Errorf("failed to restart: %w", err)
			}
		case "reload_config":
			log.Println("Received reload_config command — not yet fully implemented")
			return fmt.Errorf("reload_config not yet implemented")
		default:
			return fmt.Errorf("unknown command: %s", command)
		}
		return nil
	}

	go coordinator.PollCommands(ctx, commandHandler)

	log.Printf("Worker running (name: %s, id: %s). Press Ctrl+C to stop.", coordinator.WorkerName(), coordinator.WorkerDBID())

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	cancel()
	wg.Wait()
	coordinator.ReleaseMachines(context.Background(), machineIDs)
	coordinator.SetOffline(context.Background())
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
