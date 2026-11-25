package host

import (
	"context"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/0xfakeSpike/ollupi-desktop/sidecar/skills"
	"github.com/0xfakeSpike/ollupi/account"
	"github.com/0xfakeSpike/ollupi/auth"
	"github.com/0xfakeSpike/ollupi/pkg/llm"
	"github.com/0xfakeSpike/ollupi/pkg/sandbox"
	"github.com/0xfakeSpike/ollupi/skill"
)

func TestTheUsersBoxKeepsTheBackendsEnvironment(t *testing.T) {
	t.Setenv("MCP_TEST_FROM_PROFILE", "kept")
	t.Setenv("OLLUPI_GATEWAY_TOKEN", "secret")
	t.Setenv("BASH_FUNC_x%%", "() { :; }")
	boxes := newUserBoxes(t.TempDir())
	box, err := boxes.box("a")
	if err != nil {
		t.Fatal(err)
	}
	defer boxes.Close()
	res, err := box.Run(context.Background(), sandbox.Command{Program: "/usr/bin/env", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Stdout, "MCP_TEST_FROM_PROFILE=kept") {
		t.Errorf("a variable of the backend's did not reach the server:\n%s", res.Stdout)
	}
	if strings.Contains(res.Stdout, "OLLUPI_GATEWAY_TOKEN") {
		t.Errorf("the gateway token reached the server:\n%s", res.Stdout)
	}
}

func TestEachProfileHasItsOwnBox(t *testing.T) {
	boxes := newUserBoxes(t.TempDir())
	defer boxes.Close()
	a, err := boxes.box("a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := boxes.box("b")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("two profiles share one sandbox")
	}
}

func TestTheUsersMCPServersRunOnThisMachine(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("the mock MCP server needs node")
	}
	mock, err := filepath.Abs("../../../packages/protocol/scripts/mock-mcp.mjs")
	if err != nil {
		t.Fatal(err)
	}
	home := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	h, err := New(ctx, Options{Home: home, Token: "t"})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	a := h.ollupi.App
	if err := a.EnsureUser(ctx, "default"); err != nil {
		t.Fatal(err)
	}
	if err := a.SetMCPServer(ctx, "default", account.MCPServer{Name: "mock", Command: node, Args: []string{mock}}); err != nil {
		t.Fatal(err)
	}
	set, err := h.ollupi.Users.Tools(ctx, "default")
	if err != nil {
		t.Fatal(err)
	}
	var providers []string
	for _, s := range set.Specs() {
		providers = append(providers, s.Provider)
	}
	if !slices.Contains(providers, "mock") {
		t.Fatalf("providers = %v, unavailable %v", providers, set.Unavailable())
	}
}

func TestATokenMadeWithASecretVouchesForAProfileTheStoreHolds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	home := t.TempDir()
	h, err := New(ctx, Options{Home: home, Token: "secret", OperatorToken: "boss"})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	work, err := h.ollupi.App.CreateUser(ctx, "Work")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		token string
		want  auth.Identity
	}{
		{"secret.default", auth.Identity{User: "default"}},               // the profile a fresh home starts with
		{"secret." + work.ID, auth.Identity{User: work.ID}},              // one the operator made
		{"boss.default", auth.Identity{User: "default", Operator: true}}, // the operator's secret
		{"secret.stranger", auth.Identity{}},                             // a profile the store does not hold is not made
		{"default", auth.Identity{}},                                     // no secret, so no profile
		{"other.default", auth.Identity{}},                               // the wrong secret
		{"secret.", auth.Identity{}},                                     // no profile named
		{"secret.a/b", auth.Identity{}},                                  // not a profile id
	}
	for _, c := range cases {
		got, err := profileOf(ctx, c.token, "secret", "boss", h.ollupi.Store, h.ollupi.App)
		if got != c.want || (c.want.User == "" && err == nil) {
			t.Errorf("profileOf(%q) = %+v, %v; want %+v", c.token, got, err, c.want)
		}
	}
	if users := h.Profiles(ctx); len(users) != 2 || !slices.Contains(users, "default") || !slices.Contains(users, work.ID) {
		t.Fatalf("users = %v", users)
	}
}

func TestTheFirstProfileHasTheSkillsTheDesktopShips(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	home := t.TempDir()
	h, err := New(ctx, Options{Home: home, Token: "secret", OperatorToken: "boss"})
	if err != nil {
		t.Fatal(err)
	}
	list, _, err := h.ollupi.App.Skills(ctx, FirstProfile)
	if err != nil {
		t.Fatal(err)
	}
	i := slices.IndexFunc(list, func(s skill.Skill) bool { return s.Name == "zhou-shenghua-woodcut-style" })
	if i < 0 {
		t.Fatalf("skills = %+v", list)
	}
	if got := list[i]; !slices.Equal(slices.Sorted(slices.Values(got.Roles)), slices.Sorted(slices.Values(skills.Roles))) || len(got.Resources) == 0 {
		t.Fatalf("the starter skill is %+v", got)
	}
	// A skill the profile removed stays removed when the backend starts again.
	if err := h.ollupi.App.DeleteSkill(ctx, FirstProfile, "zhou-shenghua-woodcut-style"); err != nil {
		t.Fatal(err)
	}
	h.close()
	h, err = New(ctx, Options{Home: home, Token: "secret", OperatorToken: "boss"})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	if list, _, _ := h.ollupi.App.Skills(ctx, FirstProfile); len(list) != 0 {
		t.Fatalf("skills = %+v", list)
	}
}

func TestTheOperatorSetsTheModelsEveryProfileRunsOn(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	home := t.TempDir()
	h, err := New(ctx, Options{Home: home, Token: "secret", OperatorToken: "boss"})
	if err != nil {
		t.Fatal(err)
	}
	defer h.close()
	work, err := h.ollupi.App.CreateUser(ctx, "Work")
	if err != nil {
		t.Fatal(err)
	}
	catalog := []account.ModelProvider{{ID: "q", API: account.Anthropic, APIKey: "k", Models: []account.ProviderModel{{Name: "n", Limits: llm.Limits{Context: 1000, Output: 100}}}}}
	if err := h.ollupi.App.SetCatalog(ctx, catalog); err != nil {
		t.Fatal(err)
	}
	for _, profile := range []string{FirstProfile, work.ID} {
		models, first, _, err := h.ollupi.App.Models(ctx, profile)
		if err != nil || len(models) != 1 || first != "q/n" {
			t.Fatalf("%s runs %+v from %q, %v", profile, models, first, err)
		}
	}
}
