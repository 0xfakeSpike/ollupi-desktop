// Moving what config.yaml held before 0.7.53 into the engine: see
// config/upgrade.go. Delete this file with it in the release after 0.7.53.

package host

import (
	"context"
	"fmt"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/internal/config"
	"github.com/0xfakeSpike/ollupi/gateway"
)

// MoveOld gives the app's user what the file held: its MCP servers, its
// memory switches, and its permissions, unless the user has some of their
// own already (brought in from the old engine's database). Each is set as
// it would be from the app, so one the engine refuses fails the start and
// leaves the file as it is; a later start tries again.
func (h *Host) MoveOld(ctx context.Context, old *config.Old) error {
	a, user := h.ollupi.App, gateway.DefaultUser
	if err := a.EnsureUser(ctx, user); err != nil {
		return err
	}
	for _, s := range old.MCP {
		if err := a.SetMCPServer(ctx, user, s); err != nil {
			return fmt.Errorf("config.yaml: mcp: %s: %w", s.Name, err)
		}
	}
	if old.Memory != nil || old.Learn != nil {
		if _, err := a.UpdateSettings(ctx, user, nil, old.Memory, old.Learn); err != nil {
			return fmt.Errorf("config.yaml: memory: %w", err)
		}
	}
	if p := old.Permissions; p != nil {
		s, err := a.Settings(ctx, user)
		if err != nil {
			return err
		}
		mine := s.Permissions
		if mine.ApprovalPolicy == "" && len(mine.Rules.Allow)+len(mine.Rules.Ask)+len(mine.Rules.Deny) == 0 {
			// A rule may name an MCP server's tool, which is checked
			// against the servers connected now.
			h.ollupi.Users.Tools(ctx, user)
			if _, err := a.UpdateUserPermissions(ctx, user, *p); err != nil {
				return fmt.Errorf("config.yaml: permissions: %w", err)
			}
		}
	}
	return nil
}
