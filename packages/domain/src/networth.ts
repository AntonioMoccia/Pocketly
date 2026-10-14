/**
 * Totali di patrimonio.
 *
 * Due regole di dominio governano questo file:
 *  - un conto con Pocket e un contenitore: non ha un saldo suo, il suo totale
 *    e la somma dei Pocket (fra cui quello di default, che tiene i soldi non
 *    messi da parte). Nei totali entrano solo i Pocket, cosi niente si conta
 *    due volte;
 *  - un saldo in valuta diversa entra nei totali con il tasso salvato accanto
 *    allo snapshot; solo in sua assenza si usa il tasso corrente.
 */
import { convertMinor, crossRate, type RateMap } from "./fx";
import { sum } from "./money";

export const ACCOUNT_CATEGORIES = [
  "operational",
  "pocket",
  "emergency_fund",
  "guaranteed_capital",
  "investments",
] as const;

export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export type AccountForTotals = {
  id: string;
  parentId: string | null;
  name: string;
  category: AccountCategory;
  currency: string;
  liquid: boolean;
  archived: boolean;
  /**
   * Saldo del conto, in unita minori della sua valuta. Per un contenitore e la
   * somma dei Pocket (vedi `withPocketTotals`).
   */
  balanceCents: number;
  /** Tasso verso la valuta base salvato con lo snapshot, se presente. */
  rateToBase: number | null;
};

export type NetWorth = {
  totalCents: number;
  liquidCents: number;
  byCategory: Record<AccountCategory, number>;
  /** Conti saltati perche manca il tasso di cambio del giorno. */
  missingRates: string[];
};

function emptyByCategory(): Record<AccountCategory, number> {
  return {
    operational: 0,
    pocket: 0,
    emergency_fund: 0,
    guaranteed_capital: 0,
    investments: 0,
  };
}

/**
 * Saldo proprio del conto nella valuta base. Il tasso dello snapshot ha la
 * precedenza su quello corrente, cosi i totali storici non cambiano piu.
 */
export function ownBalanceInBase(
  account: AccountForTotals,
  baseCurrency: string,
  rates: RateMap,
): number | null {
  if (account.currency.toUpperCase() === baseCurrency.toUpperCase()) return account.balanceCents;
  const rate =
    account.rateToBase ??
    (() => {
      try {
        return crossRate(account.currency, baseCurrency, rates);
      } catch {
        return null;
      }
    })();
  if (rate === null) return null;
  return convertMinor(account.balanceCents, account.currency, baseCurrency, rate);
}

/** Id dei conti che contengono almeno un Pocket. */
export function containerIds(accounts: { parentId: string | null }[]): Set<string> {
  const ids = new Set<string>();
  for (const account of accounts) if (account.parentId) ids.add(account.parentId);
  return ids;
}

/**
 * Porta sul contenitore la somma dei suoi Pocket non archiviati. I Pocket
 * condividono la valuta del conto, quindi la somma e nella sua valuta; la data
 * e quella del Pocket aggiornato piu di recente.
 */
export function withPocketTotals<T extends AccountForTotals & { balanceDate: string | null }>(
  accounts: T[],
): T[] {
  const pocketsOf = new Map<string, T[]>();
  for (const account of accounts) {
    if (!account.parentId || account.archived) continue;
    pocketsOf.set(account.parentId, [...(pocketsOf.get(account.parentId) ?? []), account]);
  }
  const containers = containerIds(accounts);
  return accounts.map((account) => {
    if (!containers.has(account.id)) return account;
    const pockets = pocketsOf.get(account.id) ?? [];
    const dates = pockets.map((pocket) => pocket.balanceDate).filter((d): d is string => d !== null);
    return {
      ...account,
      balanceCents: sum(pockets.map((pocket) => pocket.balanceCents)),
      balanceDate: dates.length > 0 ? dates.sort().at(-1)! : null,
      rateToBase: null,
    };
  });
}

/**
 * Patrimonio totale e liquido. Entrano i Pocket e i conti senza Pocket; i
 * contenitori no, perche il loro totale e gia la somma dei Pocket: e questo
 * che evita il doppio conteggio.
 */
export function computeNetWorth(
  accounts: AccountForTotals[],
  baseCurrency: string,
  rates: RateMap,
): NetWorth {
  const byCategory = emptyByCategory();
  const missingRates: string[] = [];
  let totalCents = 0;
  let liquidCents = 0;
  const containers = containerIds(accounts);

  for (const account of accounts) {
    if (account.archived || containers.has(account.id)) continue;
    const value = ownBalanceInBase(account, baseCurrency, rates);
    if (value === null) {
      missingRates.push(account.currency.toUpperCase());
      continue;
    }
    totalCents += value;
    if (account.liquid) liquidCents += value;
    byCategory[account.category] += value;
  }

  return {
    totalCents,
    liquidCents,
    byCategory,
    missingRates: [...new Set(missingRates)],
  };
}

export type AccountNode<T extends { id: string; parentId: string | null }> = T & {
  children: AccountNode<T>[];
  depth: number;
};

/**
 * Albero dei conti: i Pocket figli sotto il conto padre, quello di default per
 * primo e gli altri in ordine di nome.
 */
export function buildAccountTree<
  T extends { id: string; parentId: string | null; name: string; isDefault?: boolean },
>(
  accounts: T[],
): AccountNode<T>[] {
  const nodes = new Map<string, AccountNode<T>>();
  for (const account of accounts) {
    nodes.set(account.id, { ...account, children: [], depth: 0 });
  }
  const roots: AccountNode<T>[] = [];
  for (const account of accounts) {
    const node = nodes.get(account.id);
    if (!node) continue;
    const parent = account.parentId ? nodes.get(account.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortByName = (a: AccountNode<T>, b: AccountNode<T>) =>
    Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name);
  const walk = (list: AccountNode<T>[], depth: number) => {
    list.sort(sortByName);
    for (const node of list) {
      node.depth = depth;
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return roots;
}

/**
 * Totale di un conto nella valuta base: per un contenitore la somma dei suoi
 * Pocket, ognuno col tasso del proprio snapshot; per un Pocket il suo saldo.
 */
export function totalWithChildren(
  accounts: AccountForTotals[],
  accountId: string,
  baseCurrency: string,
  rates: RateMap,
): number {
  const self = accounts.find((a) => a.id === accountId);
  if (!self || self.archived) return 0;
  const pockets = accounts.filter((a) => a.parentId === accountId && !a.archived);
  const counted = pockets.length > 0 ? pockets : [self];
  return sum(counted.map((a) => ownBalanceInBase(a, baseCurrency, rates) ?? 0));
}

/** Flatten dell'albero in lista ordinata, per le tabelle. */
export function flattenTree<T extends { id: string; parentId: string | null }>(
  roots: AccountNode<T>[],
): AccountNode<T>[] {
  const out: AccountNode<T>[] = [];
  const walk = (nodes: AccountNode<T>[]) => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(roots);
  return out;
}
