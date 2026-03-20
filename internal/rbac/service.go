package rbac

import "context"

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

func (s *Service) HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error) {
	isAdmin, err := s.store.IsGlobalAdmin(ctx, userID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}
	perms, err := s.store.GetUserPermissionsForSite(ctx, userID, siteID)
	if err != nil {
		return false, err
	}
	for _, p := range perms {
		if p == permission {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) GetUserSitePermissions(ctx context.Context, userID, siteID string) ([]string, error) {
	isAdmin, err := s.store.IsGlobalAdmin(ctx, userID)
	if err != nil {
		return nil, err
	}
	if isAdmin {
		perms, err := s.store.ListPermissions(ctx)
		if err != nil {
			return nil, err
		}
		codes := make([]string, len(perms))
		for i, p := range perms {
			codes[i] = p.Code
		}
		return codes, nil
	}
	return s.store.GetUserPermissionsForSite(ctx, userID, siteID)
}
