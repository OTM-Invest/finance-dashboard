import { describe, expect, it } from "vitest";

import {
  buildFileCheck,
  hasFocusError,
  mapFocusStatus,
  REASON_NO_PATH,
  shouldRecheckFiles,
} from "./focus.ts";

describe("mapFocusStatus", () => {
  it("mapeia os status do Focus para invoice_job_status", () => {
    expect(mapFocusStatus("autorizado")).toBe("authorized");
    expect(mapFocusStatus("erro_autorizacao")).toBe("rejected");
    expect(mapFocusStatus("cancelado")).toBe("cancelled");
    expect(mapFocusStatus("processando_autorizacao")).toBe("processing_authorization");
  });

  it("retorna null para status desconhecido ou nulo (não altera o job)", () => {
    expect(mapFocusStatus("status_estranho")).toBeNull();
    expect(mapFocusStatus(null)).toBeNull();
  });
});

describe("hasFocusError", () => {
  it("NÃO considera erro um corpo vazio ou nulo (evita rejeição falsa)", () => {
    expect(hasFocusError({})).toBe(false);
    expect(hasFocusError(null)).toBe(false);
    expect(hasFocusError({ erros: {} })).toBe(false);
    expect(hasFocusError({ erros: [] })).toBe(false);
  });

  it("considera erro quando há erros preenchidos, código ou mensagem", () => {
    expect(hasFocusError({ erros: [{ campo: "x", mensagem: "y" }] })).toBe(true);
    expect(hasFocusError({ codigo: "erro_validacao_schema" })).toBe(true);
    expect(hasFocusError({ mensagem: "Erro na validação do Schema XML" })).toBe(true);
  });
});

describe("buildFileCheck — por que o arquivo não veio", () => {
  const agora = new Date("2026-10-23T12:00:00Z");

  it("nota completa não recebe carimbo", () => {
    expect(buildFileCheck(null, null, agora)).toBeNull();
  });

  it("distingue 'o Focus não deu o caminho' de 'o download falhou'", () => {
    // é exatamente a distinção que faltava: as 314 NFS-e da RCO sem PDF não
    // tinham no banco nada que dissesse qual dos dois aconteceu
    expect(buildFileCheck(null, REASON_NO_PATH, agora)).toEqual({
      at: "2026-10-23T12:00:00.000Z",
      danfse: "caminho_ausente_no_focus",
    });
    expect(buildFileCheck(null, "http_404", agora)).toEqual({
      at: "2026-10-23T12:00:00.000Z",
      danfse: "http_404",
    });
  });

  it("carimba os dois arquivos quando os dois faltam", () => {
    const check = buildFileCheck("http_500", REASON_NO_PATH, agora);
    expect(check).toMatchObject({ xml: "http_500", danfse: REASON_NO_PATH });
  });
});

describe("shouldRecheckFiles — a janela da varredura", () => {
  const agora = new Date("2026-10-23T12:00:00Z");

  it("nota nunca checada é candidata", () => {
    expect(shouldRecheckFiles(null, 24, agora)).toBe(true);
    expect(shouldRecheckFiles({}, 24, agora)).toBe(true);
  });

  it("checada agora há pouco fica de fora — senão a varredura gira em falso", () => {
    const check = { fileCheck: { at: "2026-10-23T11:00:00.000Z", danfse: REASON_NO_PATH } };
    expect(shouldRecheckFiles(check, 24, agora)).toBe(false);
  });

  it("passada a janela, volta a ser candidata", () => {
    // o PDF da NFS-e municipal pode ser gerado pela prefeitura depois
    const check = { fileCheck: { at: "2026-10-21T11:00:00.000Z", danfse: REASON_NO_PATH } };
    expect(shouldRecheckFiles(check, 24, agora)).toBe(true);
  });

  it("carimbo corrompido não trava a recuperação", () => {
    expect(shouldRecheckFiles({ fileCheck: { at: "nao-e-data" } }, 24, agora)).toBe(true);
    expect(shouldRecheckFiles({ fileCheck: "lixo" }, 24, agora)).toBe(true);
  });
});
