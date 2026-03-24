package worker_test

import (
	"testing"

	"github.com/industry-dashboard/server/internal/worker"
	"github.com/stretchr/testify/assert"
)

func TestCoordinatorWorkerID(t *testing.T) {
	c := worker.NewCoordinator(nil, "test-worker", "/tmp/config.yaml", "dev")
	assert.NotEmpty(t, c.WorkerID())
	assert.Equal(t, "test-worker", c.WorkerName())
}

func TestCoordinatorFallbackName(t *testing.T) {
	c := worker.NewCoordinator(nil, "", "/tmp/config.yaml", "dev")
	assert.NotEmpty(t, c.WorkerName())
	assert.Contains(t, c.WorkerName(), "-")
}
