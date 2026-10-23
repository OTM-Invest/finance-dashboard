import { z } from "zod";

// Tem que bater com `auth.email.otp_length` (config.toml local e o painel do remoto).
export const OTP_LENGTH = 6;

// Intervalo mínimo entre envios — o GoTrue recusa antes disso (`max_frequency`).
export const OTP_RESEND_SECONDS = 60;

export const emailSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
});

export const codigoSchema = z.object({
  token: z
    .string()
    .transform(normalizarCodigo)
    .pipe(z.string().length(OTP_LENGTH, `O código tem ${OTP_LENGTH} dígitos`)),
});

/** Código colado do e-mail costuma vir com espaço ou hífen ("123 456"): fica só o dígito. */
export function normalizarCodigo(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function traduzirErroOtp(msg: string): string {
  // shouldCreateUser: false — conta só nasce pelo admin, nunca pelo login.
  if (/signups not allowed|user not found/i.test(msg)) {
    return "Este e-mail não tem acesso ao painel. Fale com o administrador.";
  }
  if (/expired|invalid/i.test(msg) && /token|otp|code/i.test(msg)) {
    return "Código inválido ou expirado. Confira o e-mail ou peça um novo código.";
  }
  if (/rate limit|only request this after|security purposes/i.test(msg)) {
    return "Muitas tentativas. Aguarde um pouco antes de pedir outro código.";
  }
  return msg;
}
