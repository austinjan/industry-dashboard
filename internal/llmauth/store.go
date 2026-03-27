package llmauth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type APIKey struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	KeyPrefix string    `json:"key_prefix"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// GenerateKey generates a new API key with the dk_ prefix.
// Returns (fullKey, prefix, bcryptHash, error).
func GenerateKey() (string, string, string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", "", "", fmt.Errorf("generate key bytes: %w", err)
	}
	raw := hex.EncodeToString(b) // 32 hex chars
	fullKey := "dk_" + raw
	prefix := fullKey[:8] // "dk_" + first 5 hex chars = 8 chars

	hash, err := bcrypt.GenerateFromPassword([]byte(fullKey), bcrypt.DefaultCost)
	if err != nil {
		return "", "", "", fmt.Errorf("hash key: %w", err)
	}
	return fullKey, prefix, string(hash), nil
}

// Create generates a new API key, stores it in the DB, and returns the record plus the full plaintext key.
func (s *Store) Create(ctx context.Context, name string) (*APIKey, string, error) {
	fullKey, prefix, hash, err := GenerateKey()
	if err != nil {
		return nil, "", err
	}

	var key APIKey
	err = s.db.QueryRow(ctx,
		`INSERT INTO llm_api_keys (name, key_hash, key_prefix)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, key_prefix, is_active, created_at`,
		name, hash, prefix,
	).Scan(&key.ID, &key.Name, &key.KeyPrefix, &key.IsActive, &key.CreatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("insert api key: %w", err)
	}
	return &key, fullKey, nil
}

// ValidateKey looks up the key by prefix and verifies it using bcrypt.
func (s *Store) ValidateKey(ctx context.Context, fullKey string) (*APIKey, error) {
	if len(fullKey) < 8 {
		return nil, fmt.Errorf("invalid key format")
	}
	prefix := fullKey[:8]

	rows, err := s.db.Query(ctx,
		`SELECT id, name, key_hash, key_prefix, is_active, created_at
		 FROM llm_api_keys
		 WHERE key_prefix = $1 AND is_active = true`,
		prefix,
	)
	if err != nil {
		return nil, fmt.Errorf("query api keys: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key APIKey
		var hash string
		if err := rows.Scan(&key.ID, &key.Name, &hash, &key.KeyPrefix, &key.IsActive, &key.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan api key: %w", err)
		}
		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(fullKey)); err == nil {
			return &key, nil
		}
	}
	return nil, fmt.Errorf("invalid api key")
}

// List returns all API keys ordered by created_at DESC.
func (s *Store) List(ctx context.Context) ([]APIKey, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, key_prefix, is_active, created_at
		 FROM llm_api_keys
		 ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query api keys: %w", err)
	}
	defer rows.Close()

	keys := make([]APIKey, 0)
	for rows.Next() {
		var key APIKey
		if err := rows.Scan(&key.ID, &key.Name, &key.KeyPrefix, &key.IsActive, &key.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan api key: %w", err)
		}
		keys = append(keys, key)
	}
	return keys, nil
}

// Revoke sets is_active=false for the given key ID.
func (s *Store) Revoke(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE llm_api_keys SET is_active = false WHERE id = $1`,
		id,
	)
	return err
}

// HasAnyKey returns true if there is at least one active API key.
func (s *Store) HasAnyKey(ctx context.Context) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM llm_api_keys WHERE is_active = true)`,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check api keys: %w", err)
	}
	return exists, nil
}
