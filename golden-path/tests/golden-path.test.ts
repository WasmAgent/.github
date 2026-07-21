// Golden Path integration test — STUB
// Status: not yet runnable. Fill in once docker-compose services are functional.
// Track: WasmAgent/.github#103

import { describe, it, expect } from "bun:test";

describe("Golden Path: Protect → Record → Audit → Admit", () => {
  it.todo("[1/4] MCP firewall blocks malicious-call.json");
  it.todo("[2/4] Signed AEP record produced for safe-call.json");
  it.todo("[3/4] Audit report generated from AEP record");
  it.todo("[4/4] Admission decision returned from trace-pipeline");

  it.todo("end-to-end: demo.sh exits 0 within 15 minutes");
  it.todo("versions.lock: all pinned versions resolve to published packages");
});
