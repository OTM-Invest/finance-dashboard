import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  codigoSchema,
  emailSchema,
  normalizarCodigo,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  traduzirErroOtp,
} from "@/features/auth/otp";

type Etapa = { tipo: "email" } | { tipo: "codigo"; email: string; enviadoEm: number };

export default function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [etapa, setEtapa] = React.useState<Etapa>({ tipo: "email" });
  const [emailDigitado, setEmailDigitado] = React.useState("");

  // Preserva a URL inteira de origem, não só o pathname: um deep link como
  // /oauth/consent?authorization_id=… perde o sentido sem a query string.
  const origem = (
    location.state as { from?: { pathname: string; search?: string; hash?: string } } | null
  )?.from;
  const destino = origem ? `${origem.pathname}${origem.search ?? ""}${origem.hash ?? ""}` : "/";

  if (session) {
    return <Navigate to={destino} replace />;
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-2">
      {/* Painel hero */}
      <div className="bento-mesh relative hidden items-end p-12 lg:flex">
        <div className="surface-gradient-brand absolute inset-6 rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]" />
        <div className="relative z-10 text-white">
          <p className="text-display font-display leading-[1.05] font-semibold text-balance">
            Visão financeira
            <br />
            de todo o grupo,
            <br />
            em um só lugar.
          </p>
          <p className="mt-4 max-w-md text-sm opacity-90">
            DRE, fluxo de caixa, folha e KPIs em tempo real — consolidados ou por empresa.
          </p>
          <div className="mt-8 flex gap-2">
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              OTM Holding
            </div>
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              OTM Assessoria
            </div>
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              OTM Corretora
            </div>
            <div className="text-2xs rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">
              RCO Tecnologia
            </div>
          </div>
        </div>
      </div>

      {/* Painel form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="surface-gradient-brand grid h-9 w-9 place-items-center rounded-[var(--radius-md)] shadow-[var(--shadow-accent)]">
              <span className="text-sm font-bold text-white">F</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold">Finance Dashboard</span>
              <span className="text-2xs text-text-subtle">OTM Group</span>
            </div>
          </div>

          {etapa.tipo === "email" ? (
            <EtapaEmail
              emailInicial={emailDigitado}
              onEnviado={(email) => {
                setEmailDigitado(email);
                setEtapa({ tipo: "codigo", email, enviadoEm: Date.now() });
              }}
            />
          ) : (
            <EtapaCodigo
              email={etapa.email}
              enviadoEm={etapa.enviadoEm}
              onReenviado={() => setEtapa({ ...etapa, enviadoEm: Date.now() })}
              onTrocarEmail={() => setEtapa({ tipo: "email" })}
              onEntrou={() => void navigate(destino, { replace: true })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EtapaEmail({
  emailInicial,
  onEnviado,
}: {
  emailInicial: string;
  onEnviado: (email: string) => void;
}) {
  const { sendOtp } = useAuth();
  const [erro, setErro] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: emailInicial },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setErro(null);
    const { error } = await sendOtp(email);
    if (error) {
      setErro(traduzirErroOtp(error));
      return;
    }
    onEnviado(email);
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
      <p className="mt-1 text-sm text-text-muted">
        Informe seu e-mail corporativo. Enviaremos um código de acesso de {OTP_LENGTH} dígitos.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="voce@otmgroup.com.br"
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="text-2xs text-expense">{errors.email.message}</p>}
        </div>

        {erro && <ErroLogin mensagem={erro} />}

        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Enviar código
        </Button>
      </form>
    </>
  );
}

function EtapaCodigo({
  email,
  enviadoEm,
  onReenviado,
  onTrocarEmail,
  onEntrou,
}: {
  email: string;
  enviadoEm: number;
  onReenviado: () => void;
  onTrocarEmail: () => void;
  onEntrou: () => void;
}) {
  const { sendOtp, verifyOtp } = useAuth();
  const [erro, setErro] = React.useState<string | null>(null);
  const [reenviando, setReenviando] = React.useState(false);
  const espera = useSegundosRestantes(enviadoEm, OTP_RESEND_SECONDS);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof codigoSchema>, unknown, z.output<typeof codigoSchema>>({
    resolver: zodResolver(codigoSchema),
    defaultValues: { token: "" },
  });

  const onSubmit = handleSubmit(async ({ token }) => {
    setErro(null);
    const { error } = await verifyOtp(email, token);
    if (error) {
      setErro(traduzirErroOtp(error));
      return;
    }
    onEntrou();
  });

  const reenviar = async () => {
    setErro(null);
    setReenviando(true);
    const { error } = await sendOtp(email);
    setReenviando(false);
    if (error) {
      setErro(traduzirErroOtp(error));
      return;
    }
    setValue("token", "");
    onReenviado();
    toast.success("Novo código enviado", {
      description: `Verifique a caixa de entrada de ${email}.`,
    });
  };

  const campo = register("token");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Confira seu e-mail</h1>
      <p className="mt-1 text-sm text-text-muted">
        Enviamos um código de {OTP_LENGTH} dígitos para{" "}
        <span className="font-medium text-text">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="token">Código de acesso</Label>
          <Input
            id="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={OTP_LENGTH}
            placeholder={"0".repeat(OTP_LENGTH)}
            className="text-center font-mono text-lg tracking-[0.5em] tabular-nums"
            {...campo}
            onChange={(e) => {
              // Normaliza já no campo: colar "123 456" vira "123456" sem estourar o maxLength.
              e.target.value = normalizarCodigo(e.target.value);
              void campo.onChange(e);
            }}
            aria-invalid={!!errors.token}
          />
          {errors.token && <p className="text-2xs text-expense">{errors.token.message}</p>}
        </div>

        {erro && <ErroLogin mensagem={erro} />}

        <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </Button>
      </form>

      <div className="mt-8 flex items-center justify-between text-xs text-text-muted">
        <button
          type="button"
          onClick={onTrocarEmail}
          className="underline-offset-4 hover:text-accent hover:underline"
        >
          Usar outro e-mail
        </button>
        <button
          type="button"
          disabled={reenviando || espera > 0}
          onClick={() => void reenviar()}
          className="underline-offset-4 hover:text-accent hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          {reenviando ? "Enviando…" : espera > 0 ? `Reenviar em ${espera}s` : "Reenviar código"}
        </button>
      </div>
    </>
  );
}

function ErroLogin({ mensagem }: { mensagem: string }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-[var(--color-expense)]/20 bg-expense-soft px-3 py-2 text-xs text-expense"
    >
      {mensagem}
    </div>
  );
}

function useSegundosRestantes(desde: number, total: number): number {
  const calcular = React.useCallback(
    () => Math.max(0, total - Math.floor((Date.now() - desde) / 1000)),
    [desde, total],
  );
  const [restante, setRestante] = React.useState(calcular);

  React.useEffect(() => {
    setRestante(calcular());
    const id = window.setInterval(() => {
      const r = calcular();
      setRestante(r);
      if (r === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [calcular]);

  return restante;
}
