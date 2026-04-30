import test from "node:test";
import assert from "node:assert/strict";
import {
  isInputsDiagnosticProfile,
  SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC,
} from "../scripts/lib/sense-ia-ask-core.js";
import {
  SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC as PROFILE_FROM_PROMPT,
  SYSTEM_INPUTS_DIAGNOSTIC_PT,
} from "../scripts/lib/sense-ia-inputs-diagnostic-prompt.js";

test("perfil inputs_diagnostic é exportado de forma consistente", () => {
  assert.equal(SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC, "inputs_diagnostic");
  assert.equal(PROFILE_FROM_PROMPT, "inputs_diagnostic");
  assert.equal(SENSE_IA_PROFILE_INPUTS_DIAGNOSTIC, PROFILE_FROM_PROMPT);
});

test("isInputsDiagnosticProfile reconhece profile em lower/upper", () => {
  assert.equal(isInputsDiagnosticProfile({ SENSE_IA_PROMPT_PROFILE: "inputs_diagnostic" }), true);
  assert.equal(isInputsDiagnosticProfile({ SENSE_IA_PROMPT_PROFILE: "INPUTS_DIAGNOSTIC" }), true);
});

test("isInputsDiagnosticProfile retorna false para outros perfis", () => {
  assert.equal(isInputsDiagnosticProfile({ SENSE_IA_PROMPT_PROFILE: "gatilho_fa_diagnostic" }), false);
  assert.equal(isInputsDiagnosticProfile({ SENSE_IA_PROMPT_PROFILE: "" }), false);
  assert.equal(isInputsDiagnosticProfile({}), false);
});

test("prompt de diagnóstico de inputs contém seções obrigatórias", () => {
  assert.match(SYSTEM_INPUTS_DIAGNOSTIC_PT, /\*\*I\) Inputs do Gatilho — diagnóstico\*\*/);
  assert.match(SYSTEM_INPUTS_DIAGNOSTIC_PT, /\*\*II\) Ações recomendadas \(ordem de prioridade\)\*\*/);
  assert.match(SYSTEM_INPUTS_DIAGNOSTIC_PT, /\*\*III\) Diagnóstico geral\*\*/);
});
