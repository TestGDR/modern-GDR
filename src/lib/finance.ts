// Attività e investimenti: tipi e testi condivisi.
// Prezzi, rendite e regole stanno nel database: qui solo la presentazione.

export type BusinessType = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  price: number;
  base_income: number;
  skill_id: string | null;
  max_owners: number | null;
  active: boolean;
  sort_order: number;
};

export type CharacterBusiness = {
  id: number;
  character_id: string;
  type_id: string | null;
  type_name: string;
  name: string;
  price_paid: number;
  base_income: number;
  skill_id: string | null;
  managed_at: string;
  acquired_at: string;
};

export type BusinessOutcome = "oro" | "buono" | "fiacco" | "disastro";

export type BusinessReport = {
  id: number;
  auto: boolean;
  d10: number;
  crit: "none" | "success" | "failure";
  extra: number | null;
  total: number;
  cd: number;
  margin: number;
  outcome: BusinessOutcome;
  amount: number;
  created_at: string;
};

export const OUTCOME_LABEL: Record<BusinessOutcome, string> = {
  oro: "Mese d'oro",
  buono: "Mese normale",
  fiacco: "Mese fiacco",
  disastro: "Mese disastroso",
};

export type BusinessOwner = { name: string; type: string; character_id: string; owner: string };

export type InvestmentProduct = {
  id: string;
  name: string;
  description: string;
  risk: "basso" | "medio" | "alto";
  min_pct: number;
  max_pct: number;
  crash_chance: number;
  crash_pct: number;
  /** la mia posizione (null se non ho investito) */
  invested: number | null;
  value: number | null;
  moved_at: string | null;
  history: { pct: number; crash: boolean; value: number; at: string }[];
};

export type InvestmentsOverview = { minimum: number; fee: number; days: number; products: InvestmentProduct[] };

export const RISK_LABEL: Record<InvestmentProduct["risk"], string> = { basso: "Rischio basso", medio: "Rischio medio", alto: "Rischio alto" };

/** "+2,5%" con il segno */
export function pctText(n: number) {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}
