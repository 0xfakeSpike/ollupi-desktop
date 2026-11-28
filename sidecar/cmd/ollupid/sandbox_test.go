package main

import "testing"

func TestTheBridgeInTheEnvironmentIsTheCloudflareSandbox(t *testing.T) {
	t.Setenv("SANDBOX_API_URL", "")
	t.Setenv("SANDBOX_API_KEY", "")
	providers, err := sandboxProviders()
	if err != nil || providers != nil {
		t.Fatalf("with no bridge: %v, %v", providers, err)
	}
	t.Setenv("SANDBOX_API_URL", "https://sandbox-bridge.example.workers.dev")
	t.Setenv("SANDBOX_API_KEY", "k")
	providers, err = sandboxProviders()
	if err != nil {
		t.Fatal(err)
	}
	if providers["cloudflare"] == nil || len(providers) != 1 {
		t.Fatalf("providers = %v", providers)
	}
}
