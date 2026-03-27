package main

import (
	"embed"
	"log"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

//go:embed all:migrations
var migrationsFS embed.FS

func autoMigrate(databaseURL string) {
	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		log.Printf("Warning: could not load embedded migrations: %v", err)
		return
	}
	m, err := migrate.NewWithSourceInstance("iofs", source, databaseURL)
	if err != nil {
		log.Printf("Warning: could not init migrator: %v", err)
		return
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		log.Fatalf("Migration failed: %v", err)
	}
	v, dirty, _ := m.Version()
	log.Printf("Database migrations up to date (version %d, dirty=%v)", v, dirty)
}
