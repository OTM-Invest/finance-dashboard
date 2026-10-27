import { describe, expect, it } from "vitest";

import { parseLines, parseReports } from "./contract";
import { linesResponse, REPORT_IDS, reportsResponse } from "./fixtures";
import {
  buildSyncPayload,
  ConferenceError,
  defaultWindow,
  readSyncConfig,
  resolveWindow,
} from "./sync";

const data = { reports: parseReports(reportsResponse), lines: parseLines(linesResponse) };

describe("janela da sincronização", () => {
  it("padrão: seis meses para trás até o mês corrente", () => {
    expect(defaultWindow(new Date("2026-10-27T12:00:00Z"))).toEqual({
      from: "2026-04-01",
      to: "2026-10-01",
    });
    expect(defaultWindow(new Date("2026-02-10T00:00:00Z"))).toEqual({
      from: "2025-08-01",
      to: "2026-02-01",
    });
  });

  it("aceita o período do botão e recusa formato ou ordem errados", () => {
    const today = new Date("2026-10-27T12:00:00Z");
    expect(resolveWindow({ from: "2026-01-01", to: "2026-03-01" }, today)).toEqual({
      from: "2026-01-01",
      to: "2026-03-01",
    });
    expect(() => resolveWindow({ from: "2026-01-15" }, today)).toThrow(/primeiro dia/);
    expect(() => resolveWindow({ from: "2026-05-01", to: "2026-03-01" }, today)).toThrow(
      /invertido/,
    );
  });
});

describe("payload da sincronização", () => {
  it("monta relatórios e linhas no formato do banco", () => {
    const payload = buildSyncPayload(data);
    expect(payload.reports).toHaveLength(3);
    expect(payload.reports[0]).toMatchObject({
      id: REPORT_IDS.PJ1_A,
      reference_month: "2026-09-01",
      total_commission: 1101.01,
    });
    expect(payload.lines[2]).toMatchObject({ report_id: REPORT_IDS.PJ1_A, commission: 0.335 });
    expect(payload.checks.every((c) => c.ok)).toBe(true);
  });

  it("um relatório que não fecha barra tudo, dizendo qual", () => {
    const broken = {
      ...data,
      reports: data.reports.map((r) =>
        r.id === REPORT_IDS.FINDER ? { ...r, totalCommission: 300.49 } : r,
      ),
    };
    expect(() => buildSyncPayload(broken)).toThrow(ConferenceError);
    expect(() => buildSyncPayload(broken)).toThrow(
      /finder 2026-07 finder-jul-ago: linhas 300\.50 × total 300\.49/,
    );
  });
});

describe("configuração no Vault", () => {
  const full = {
    crm_revenue_sync_secret: "s",
    crm_supabase_url: "https://crm.example/",
    crm_supabase_anon_key: "anon",
    crm_sync_email: "servico@crm",
    crm_sync_password: "senha",
  };

  it("monta a configuração do CRM, sem barra no fim da URL", () => {
    expect(readSyncConfig(full)).toEqual({
      ok: true,
      syncSecret: "s",
      crm: { url: "https://crm.example", anonKey: "anon", email: "servico@crm", password: "senha" },
    });
  });

  it("diz quais nomes faltam, sem ecoar os valores presentes", () => {
    const result = readSyncConfig({ ...full, crm_sync_password: " ", crm_sync_email: undefined });
    expect(result).toEqual({
      ok: false,
      syncSecret: "s",
      missing: ["crm_sync_email", "crm_sync_password"],
    });
    expect(JSON.stringify(result)).not.toContain("anon");
  });

  it("Vault vazio ou resposta estranha = tudo faltando", () => {
    expect(readSyncConfig(null)).toMatchObject({ ok: false, syncSecret: null });
    expect(readSyncConfig([])).toMatchObject({ ok: false });
  });
});
