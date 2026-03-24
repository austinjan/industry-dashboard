package worker

import (
	"math"
	"math/rand"
)

type Generator struct {
	rng        *rand.Rand
	driftState map[string]float64
}

func NewGenerator() *Generator {
	return &Generator{
		rng:        rand.New(rand.NewSource(rand.Int63())),
		driftState: make(map[string]float64),
	}
}

// GenerateFor generates a value for a specific metric, maintaining per-metric drift state.
func (g *Generator) GenerateFor(metricName, pattern string, min, max float64, tick int) float64 {
	rng := max - min
	switch pattern {
	case "sine":
		return g.sine(min, rng, tick)
	case "drift":
		return g.drift(metricName, min, max, rng)
	case "spike":
		return g.spike(min, rng)
	default: // random
		return min + g.rng.Float64()*rng
	}
}

// Generate is a convenience wrapper without metric name (for tests).
func (g *Generator) Generate(pattern string, min, max float64, tick int) float64 {
	return g.GenerateFor("default", pattern, min, max, tick)
}

func (g *Generator) sine(min, rng float64, tick int) float64 {
	base := (math.Sin(float64(tick)*0.1) + 1) / 2
	noise := (g.rng.Float64() - 0.5) * 0.1
	v := min + (base+noise)*rng
	return clamp(v, min, min+rng)
}

func (g *Generator) drift(metricName string, min, max, rng float64) float64 {
	current, exists := g.driftState[metricName]
	if !exists {
		current = min + rng*0.5
	}
	step := (g.rng.Float64() - 0.5) * rng * 0.05
	center := min + rng*0.5
	reversion := (center - current) * 0.02
	current += step + reversion
	current = clamp(current, min, max)
	g.driftState[metricName] = current
	return current
}

func (g *Generator) spike(min, rng float64) float64 {
	if g.rng.Float64() < 0.05 {
		return min + rng*(0.85+g.rng.Float64()*0.15)
	}
	return min + g.rng.Float64()*rng*0.7
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
