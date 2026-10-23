import { NavLink, Outlet, useLocation } from "react-router-dom";

import { cn } from "@/lib/cn";

const NAV = [
  { to: "/settings/banks", label: "Contas bancárias" },
  { to: "/settings/cost-centers", label: "Áreas" },
  { to: "/settings/management-plan", label: "Plano gerencial" },
  { to: "/settings/counterparties", label: "Contrapartes" },
  { to: "/settings/payroll", label: "Folha de pagamento" },
] as const;

export function SettingsLayout() {
  const location = useLocation();
  const isIndex = location.pathname === "/settings";

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] p-6 lg:p-8">
      <div className="mb-6">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          Configurações
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          Cadastros & Estrutura
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Gerencie contas bancárias, áreas, plano gerencial e contrapartes usados nos lançamentos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <aside>
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-text-muted hover:bg-surface-2 hover:text-text",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{isIndex ? <SettingsIndex /> : <Outlet />}</main>
      </div>
    </div>
  );
}

function SettingsIndex() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 transition-colors hover:border-accent/40"
        >
          <div className="text-sm font-medium text-text">{item.label}</div>
          <div className="mt-1 text-xs text-text-muted">{descricaoFor(item.to)}</div>
        </NavLink>
      ))}
    </div>
  );
}

function descricaoFor(to: string): string {
  switch (to) {
    case "/settings/banks":
      return "Adicionar ou editar contas bancárias e saldos iniciais.";
    case "/settings/cost-centers":
      return "Os times da organização: para quem é cada gasto.";
    case "/settings/management-plan":
      return "O que cada gasto é — pessoas, tecnologia, ocupação —, a partir da conta contábil.";
    case "/settings/counterparties":
      return "Clientes, fornecedores e demais contrapartes vinculadas a lançamentos.";
    default:
      return "";
  }
}
