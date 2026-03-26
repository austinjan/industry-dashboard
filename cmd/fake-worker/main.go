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

var version = "dev"

func main() {
	configPath := flag.String("config", "cmd/fake-worker/config.yaml", "Path to worker config YAML")
	flag.Parse()

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

	appCfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := database.Connect(ctx, appCfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	result, err := worker.Provision(ctx, pool, workerCfg)
	if err != nil {
		log.Fatalf("Failed to provision: %v", err)
	}
	log.Printf("Provisioned %d machines", len(result.Machines))

	// Attach DataSource to each machine
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

	coordinator := worker.NewCoordinator(pool, workerCfg.WorkerName, *configPath, configJSON, version)
	if err := coordinator.Register(ctx); err != nil {
		log.Fatalf("Failed to register worker: %v", err)
	}

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

	log.Printf("Fake worker running (worker_id: %s). Press Ctrl+C to stop.", coordinator.WorkerID())

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
