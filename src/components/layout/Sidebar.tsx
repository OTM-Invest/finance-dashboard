import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  CalendarRange,
  CreditCard,
  FileBarChart,
  FileDown,
  FileText,
  GitCompare,
  History,
  Landmark,
  LayoutDashboard,
  Plug,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  Webhook,
} from "lucide-react";

import type { DataModule } from "@/features/auth/modules";
import { usePermissions } from "@/features/auth/usePermissions";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  /** Módulo exigido para ver o item; ausente = sempre visível (subject a admin/superadmin). */
  module?: DataModule;
}

const navItems: NavItem[] = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Lançamentos", icon: ArrowLeftRight, module: "financials" },
  { to: "/bills", label: "Contas a Pagar/Receber", icon: Receipt, module: "financials" },
  { to: "/dre", label: "DRE", icon: FileBarChart, module: "financials" },
  { to: "/cashflow", label: "Fluxo de Caixa", icon: TrendingUp, module: "financials" },
  { to: "/contas", label: "Contas", icon: Wallet, module: "financials" },
  { to: "/reconciliation", label: "Conciliação", icon: GitCompare, module: "financials" },
  { to: "/faturas", label: "Faturas de cartão", icon: CreditCard, module: "financials" },
  { to: "/forecast", label: "Forecast 90d", icon: CalendarRange, module: "financials" },
  // `end` para o item não ficar ativo junto de /reports/builder.
  { to: "/reports", label: "Relatórios", icon: BarChart3, end: true, module: "financials" },
  {
    to: "/reports/builder",
    label: "Exportar Relatório",
    icon: FileDown,
    module: "financials",
  },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart, module: "sales" },
  { to: "/taxes", label: "Impostos", icon: Landmark, module: "taxes" },
  { to: "/nfse", label: "NFS-e", icon: FileText, module: "nfse" },
  { to: "/payroll", label: "Folha", icon: Users, module: "payroll" },
  { to: "/recurring", label: "Recorrências", icon: Repeat, module: "financials" },
  { to: "/import", label: "Importar", icon: Upload, module: "financials" },
];

const adminItems: NavItem[] = [
  { to: "/audit", label: "Auditoria", icon: History, module: "audit" },
  { to: "/companies", label: "Empresas", icon: Building2 },
  // `end` para o item não ficar ativo junto de /integracoes/:slug
  { to: "/integracoes", label: "Integrações", icon: Plug, end: true },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/settings", label: "Configurações", icon: Settings, module: "financials" },
];

const superAdminItems: NavItem[] = [{ to: "/users", label: "Usuários", icon: ShieldCheck }];

interface Props {
  /** When provided, clicking a link triggers this (for mobile drawer dismiss). */
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: Props) {
  const { isSuperAdmin, canView } = usePermissions();
  const visible = (item: NavItem) => !item.module || canView(item.module);
  const mainNav = navItems.filter(visible);
  const adminNav = adminItems.filter(visible);
  return (
    <aside className="flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-[var(--topbar-height)] items-center gap-2.5 border-b border-border px-5">
        <div className="surface-gradient-brand grid h-8 w-8 place-items-center rounded-[var(--radius-md)] shadow-[var(--shadow-accent)]">
          <span className="text-sm font-bold text-white">F</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-semibold">Finance</span>
          <span className="text-2xs text-text-subtle">OTM Group</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {mainNav.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
                <item.icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {adminNav.length > 0 && (
          <>
            <div className="text-2xs mt-6 px-2 pt-3 pb-2 font-medium tracking-wide text-text-subtle uppercase">
              Administração
            </div>
            <ul className="space-y-0.5">
              {adminNav.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} onClick={onNavigate} className={navLinkClass}>
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="text-2xs mt-6 px-2 pt-3 pb-2 font-medium tracking-wide text-text-subtle uppercase">
              Sistema
            </div>
            <ul className="space-y-0.5">
              {superAdminItems.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} onClick={onNavigate} className={navLinkClass}>
                    <item.icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-[var(--radius-md)] bg-accent-soft px-3 py-3 text-xs">
          <p className="font-medium text-accent">Dica: ⌘K</p>
          <p className="mt-0.5 leading-snug text-text-muted">
            Busca rápida e navegação em qualquer tela.
          </p>
        </div>
      </div>
    </aside>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
    isActive ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-2 hover:text-text",
  );
}
