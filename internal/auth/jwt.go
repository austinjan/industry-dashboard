package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	TokenType string `json:"token_type"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secret          []byte
	accessDuration  time.Duration
	refreshDuration time.Duration
}

func NewJWTService(secret string, accessDuration, refreshDuration time.Duration) *JWTService {
	return &JWTService{
		secret:          []byte(secret),
		accessDuration:  accessDuration,
		refreshDuration: refreshDuration,
	}
}

func (s *JWTService) CreateAccessToken(userID, email string) (string, error) {
	return s.createToken(userID, email, "access", s.accessDuration)
}

func (s *JWTService) CreateRefreshToken(userID, email string) (string, error) {
	return s.createToken(userID, email, "refresh", s.refreshDuration)
}

func (s *JWTService) createToken(userID, email, tokenType string, duration time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Email:     email,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(duration)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}
