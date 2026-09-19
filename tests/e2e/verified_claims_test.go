package e2e

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// TestVerifiedClaimsSection keeps the profile README's public-claims trust
// signal in lockstep with claims/public-claims.yml: the claim counter and the
// registry review date shown on the org homepage must match the live registry,
// and the registry must be reachable through its canonical absolute URL.
func TestVerifiedClaimsSection(t *testing.T) {
	profile, err := os.ReadFile("../../profile/README.md")
	if err != nil {
		t.Fatalf("failed to read profile/README.md: %v", err)
	}
	claims, err := os.ReadFile("../../claims/public-claims.yml")
	if err != nil {
		t.Fatalf("failed to read claims/public-claims.yml: %v", err)
	}

	profileText := string(profile)
	claimsText := string(claims)

	activeClaimCount := len(regexp.MustCompile(`(?m)^\s+status:\s+supported\s*$`).FindAllString(claimsText, -1))

	reviewMatch := regexp.MustCompile(`(?m)^last_reviewed:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*$`).FindStringSubmatch(claimsText)
	if len(reviewMatch) != 2 {
		t.Fatal("claims registry is missing a valid last_reviewed date")
	}

	readmeNormalized := strings.Join(strings.Fields(profileText), " ")
	if !strings.Contains(readmeNormalized, "https://github.com/WasmAgent/.github/blob/main/claims/public-claims.yml") {
		t.Fatal("profile README is missing the canonical public-claims.yml URL")
	}
	if !strings.Contains(readmeNormalized, strconv.Itoa(activeClaimCount)+" public claims") {
		t.Fatalf("profile README does not show the active claim count (%d)", activeClaimCount)
	}
	if !strings.Contains(readmeNormalized, "Registry last reviewed **"+reviewMatch[1]+"**") {
		t.Fatalf("profile README does not show the registry review date (%s)", reviewMatch[1])
	}
	if !strings.Contains(readmeNormalized, "records public software-property claims together with evidence links and review dates so they can be checked independently") {
		t.Fatal("profile README is missing its independently checkable claims explanation")
	}
}
