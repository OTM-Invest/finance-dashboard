import type { VendorSummary } from "../compute";
import { EmptyState, Money, SpendTable, Tag, Td, Th } from "./ui";

interface Props {
  vendors: VendorSummary[];
  /** Gasto total do período — base da participação e da concentração. */
  total: number;
  /** Gasto sem fornecedor identificado (lançamento sem contraparte). */
  withoutVendor: number;
  companyName: (id: string) => string;
}

/** Linhas no ranking. O resto aparece somado — a pergunta é "quem pesa". */
const TOP = 40;

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function VendorsSection({ vendors, total, withoutVendor, companyName }: Props) {
  if (vendors.length === 0)
    return <EmptyState>Nenhum fornecedor identificado no período.</EmptyState>;

  const top = vendors.slice(0, TOP);
  const rest = vendors.slice(TOP).reduce((s, v) => s + v.total, 0);
  const top5 = vendors.slice(0, 5).reduce((s, v) => s + v.total, 0);
  const multi = vendors.filter((v) => v.companyIds.length > 1).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Os 5 maiores fornecedores somam <strong className="text-text">{pct(top5, total)}</strong> do
        gasto. {multi > 0 && <>{multi} aparecem em mais de uma empresa. </>}
        {withoutVendor > 0 && (
          <>
            <Money value={withoutVendor} /> ({pct(withoutVendor, total)}) não têm fornecedor
            identificado — lançamento sem contraparte.
          </>
        )}
      </p>
      <SpendTable>
        <thead className="bg-surface-2">
          <tr>
            <Th align="left" className="w-10">
              #
            </Th>
            <Th align="left">Fornecedor</Th>
            <Th>Período</Th>
            <Th>% do gasto</Th>
            <Th>Meses</Th>
            <Th align="left">Empresas</Th>
          </tr>
        </thead>
        <tbody>
          {top.map((v, i) => (
            <tr key={v.key} className="border-t border-border">
              <Td align="left" className="text-text-subtle">
                {i + 1}
              </Td>
              <Td align="left" className="font-medium">
                <span className="mr-2">{v.name}</span>
                {v.sources.includes("card") && <Tag>cartão</Tag>}
              </Td>
              <Td className="font-semibold">
                <Money value={v.total} />
              </Td>
              <Td className="text-text-muted">{pct(v.total, total)}</Td>
              <Td className="text-text-muted">{v.months.length}</Td>
              <Td align="left" className="text-xs text-text-muted">
                {v.companyIds.length > 1 ? (
                  <span className="font-medium text-text">
                    {v.companyIds.length} empresas ·{" "}
                    <span className="font-normal text-text-muted">
                      {v.companyIds.map(companyName).join(", ")}
                    </span>
                  </span>
                ) : (
                  companyName(v.companyIds[0])
                )}
              </Td>
            </tr>
          ))}
          {rest !== 0 && (
            <tr className="border-t border-border text-text-muted">
              <Td align="left" />
              <Td align="left" className="italic">
                Outros {vendors.length - TOP} fornecedores
              </Td>
              <Td>
                <Money value={rest} />
              </Td>
              <Td>{pct(rest, total)}</Td>
              <Td colSpan={2} />
            </tr>
          )}
        </tbody>
      </SpendTable>
    </div>
  );
}
