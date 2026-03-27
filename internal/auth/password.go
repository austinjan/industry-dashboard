package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

// Pre-computed dummy hash for timing-safe not-found path (per STATE.md decision)
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-sentinel"), bcryptCost)

// HashPassword hashes a plaintext password with bcrypt cost 12.
func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	return string(b), err
}

// CheckPassword compares a bcrypt hash against a plaintext candidate.
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// DummyCheckPassword performs a bcrypt comparison against a pre-computed hash.
// Call on user-not-found path to prevent timing-based email enumeration.
func DummyCheckPassword(plain string) {
	bcrypt.CompareHashAndPassword(dummyHash, []byte(plain))
}
