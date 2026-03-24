package worker_test

import (
	"context"
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFakeDataSource_Read(t *testing.T) {
	regs := []worker.RegisterConfig{
		{Name: "temperature", Fake: &worker.FakeConfig{Min: 60, Max: 95, Pattern: "random"}},
		{Name: "speed", Fake: &worker.FakeConfig{Min: 80, Max: 150, Pattern: "sine"}},
	}
	src := worker.NewFakeDataSource(regs)
	defer src.Close()

	result, err := src.Read(context.Background())
	require.NoError(t, err)
	assert.Len(t, result.Values, 2)
	assert.GreaterOrEqual(t, result.Values["temperature"], 60.0)
	assert.LessOrEqual(t, result.Values["temperature"], 95.0)
	assert.GreaterOrEqual(t, result.Values["speed"], 80.0)
	assert.LessOrEqual(t, result.Values["speed"], 150.0)
}

func TestFakeDataSource_TickAdvances(t *testing.T) {
	regs := []worker.RegisterConfig{
		{Name: "counter", Fake: &worker.FakeConfig{Min: 0, Max: 10000, Pattern: "monotonic"}},
	}
	src := worker.NewFakeDataSource(regs)
	defer src.Close()

	r1, _ := src.Read(context.Background())
	r2, _ := src.Read(context.Background())
	assert.GreaterOrEqual(t, r2.Values["counter"], r1.Values["counter"])
}

func TestFakeDataSource_SkipsStringRegisters(t *testing.T) {
	regs := []worker.RegisterConfig{
		{Name: "temperature", Fake: &worker.FakeConfig{Min: 60, Max: 95, Pattern: "random"}},
		{Name: "serial", DataType: "string", Length: 5, Fake: &worker.FakeConfig{}},
	}
	src := worker.NewFakeDataSource(regs)
	defer src.Close()

	result, err := src.Read(context.Background())
	require.NoError(t, err)
	assert.Len(t, result.Values, 1)
	assert.Contains(t, result.Values, "temperature")
}
