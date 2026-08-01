package e2e

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

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
	sectionIdx := strings.Index(profileText, "## Verified Claims")
	brandDiagramIdx := strings.Index(profileText, "![WasmAgent architecture]")
	if sectionIdx < 0 {
		t.Fatal("profile/README.md is missing the Verified Claims section")
	}
	if brandDiagramIdx < 0 || sectionIdx > brandDiagramIdx {
		t.Fatal("Verified Claims section must appear before the org brand diagram")
	}

	activeClaimCount := len(regexp.MustCompile(`(?m)^\s+status:\s+supported\s*$`).FindAllString(claimsText, -1))

	reviewMatch := regexp.MustCompile(`(?m)^last_reviewed:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*$`).FindStringSubmatch(claimsText)
	if len(reviewMatch) != 2 {
		t.Fatal("claims registry is missing a valid last_reviewed date")
	}

	readmeNormalized := strings.Join(strings.Fields(profileText), " ")
	if !strings.Contains(readmeNormalized, "[`public-claims.yml`](https://github.com/WasmAgent/.github/blob/main/claims/public-claims.yml)") {
		t.Fatal("Verified Claims section is missing the canonical public-claims.yml link")
	}
	if !strings.Contains(readmeNormalized, strconv.Itoa(activeClaimCount)+" active public claims") {
		t.Fatalf("Verified Claims section does not show the active claim count (%d)", activeClaimCount)
	}
	if !strings.Contains(readmeNormalized, "Last reviewed: **"+reviewMatch[1]+"**") {
		t.Fatalf("Verified Claims section does not show the registry review date (%s)", reviewMatch[1])
	}
	if !strings.Contains(readmeNormalized, "public claims about our software properties, each with an evidence link and review date — independently checkable") {
		t.Fatal("Verified Claims section is missing its independently checkable claims explanation")
	}
}
