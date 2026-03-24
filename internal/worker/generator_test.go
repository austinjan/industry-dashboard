package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
)

func TestGenerateValue_Random(t *testing.T) {
	g := worker.NewGenerator()
	for i := 0; i < 100; i++ {
		v := g.Generate("random", 10, 20, i)
		assert.GreaterOrEqual(t, v, 10.0)
		assert.LessOrEqual(t, v, 20.0)
	}
}

func TestGenerateValue_Sine(t *testing.T) {
	g := worker.NewGenerator()
	for i := 0; i < 100; i++ {
		v := g.Generate("sine", 50, 100, i)
		assert.GreaterOrEqual(t, v, 50.0)
		assert.LessOrEqual(t, v, 100.0)
	}
}

func TestGenerateValue_Drift(t *testing.T) {
	g := worker.NewGenerator()
	v1 := g.Generate("drift", 60, 90, 0)
	v2 := g.Generate("drift", 60, 90, 1)
	// Values should be close but not identical
	assert.InDelta(t, v1, v2, 10.0)
	assert.GreaterOrEqual(t, v1, 60.0)
	assert.LessOrEqual(t, v1, 90.0)
}

func TestGenerateValue_Spike(t *testing.T) {
	g := worker.NewGenerator()
	values := make([]float64, 200)
	spikeCount := 0
	for i := 0; i < 200; i++ {
		values[i] = g.Generate("spike", 50, 100, i)
		assert.GreaterOrEqual(t, values[i], 50.0)
		assert.LessOrEqual(t, values[i], 100.0)
		if values[i] > 90 { // Spike zone (top 10% of range)
			spikeCount++
		}
	}
	// Should have at least some spikes but not all
	assert.Greater(t, spikeCount, 0)
	assert.Less(t, spikeCount, 100)
}
