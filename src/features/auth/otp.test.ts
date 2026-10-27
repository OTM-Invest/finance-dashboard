import { describe, expect, it } from "vitest";

import { codigoSchema, emailSchema, normalizarCodigo, traduzirErroOtp } from "./otp";

describe("normalizarCodigo", () => {
  it("remove espaço e hífen de código colado do e-mail", () => {
    expect(normalizarCodigo("123 456")).toBe("123456");
    expect(normalizarCodigo("123-456")).toBe("123456");
  });

  it("corta no tamanho do código", () => {
    expect(normalizarCodigo("1234567890")).toBe("123456");
  });
});

describe("codigoSchema", () => {
  it("aceita código com separador e devolve só os dígitos", () => {
    expect(codigoSchema.parse({ token: " 12 34 56 " })).toEqual({ token: "123456" });
  });

  it("recusa código incompleto", () => {
    expect(codigoSchema.safeParse({ token: "12345" }).success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("apara espaços antes de validar", () => {
    expect(emailSchema.parse({ email: "  a@b.com " })).toEqual({ email: "a@b.com" });
  });

  it("recusa e-mail inválido", () => {
    expect(emailSchema.safeParse({ email: "a@" }).success).toBe(false);
  });
});

describe("traduzirErroOtp", () => {
  it("e-mail sem conta não vira cadastro", () => {
    expect(traduzirErroOtp("Signups not allowed for otp")).toMatch(/não tem acesso/);
  });

  it("código errado ou vencido", () => {
    expect(traduzirErroOtp("Token has expired or is invalid")).toMatch(/inválido ou expirado/);
  });

  it("limite de envio", () => {
    expect(
      traduzirErroOtp("For security purposes, you can only request this after 42 seconds."),
    ).toMatch(/Aguarde/);
    expect(traduzirErroOtp("email rate limit exceeded")).toMatch(/Aguarde/);
  });

  it("mensagem desconhecida passa adiante", () => {
    expect(traduzirErroOtp("boom")).toBe("boom");
  });
});
