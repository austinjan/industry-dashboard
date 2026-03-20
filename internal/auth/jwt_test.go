package auth_test

import (
	"testing"
	"time"

	"github.com/industry-dashboard/server/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateAccessToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	token, err := j.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}

func TestValidateAccessToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	token, err := j.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)
	claims, err := j.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", claims.UserID)
	assert.Equal(t, "user@example.com", claims.Email)
	assert.Equal(t, "access", claims.TokenType)
}

func TestCreateRefreshToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	token, err := j.CreateRefreshToken("user-123", "user@example.com")
	require.NoError(t, err)
	claims, err := j.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, "refresh", claims.TokenType)
}

func TestValidateExpiredToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", -1*time.Second, 168*time.Hour)
	token, err := j.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)
	_, err = j.ValidateToken(token)
	assert.Error(t, err)
}

func TestValidateWrongSecret(t *testing.T) {
	j1 := auth.NewJWTService("secret-1", 15*time.Minute, 168*time.Hour)
	j2 := auth.NewJWTService("secret-2", 15*time.Minute, 168*time.Hour)
	token, err := j1.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)
	_, err = j2.ValidateToken(token)
	assert.Error(t, err)
}
