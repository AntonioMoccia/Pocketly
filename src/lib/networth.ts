/**
 * Totali di patrimonio.
 *
 * Due regole di dominio governano questo file:
 *  - un Pocket e un conto con `parentId`: ogni conto entra nei totali una volta
 *    sola, quindi il totale di un conto padre mostrato a schermo (proprio +
 *    figli) non si somma mai al totale generale;
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
  /** Saldo proprio del conto, in unita minori della sua valuta. */
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

/**
 * Patrimonio totale e liquido. Ogni conto non archiviato contribuisce una
 * volta sola, Pocket compresi: e questo che evita il doppio conteggio.
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

  for (const account of accounts) {
    if (account.archived) continue;
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

/** Albero dei conti: i Pocket figli sotto il conto padre, in ordine di nome. */
export function buildAccountTree<T extends { id: string; parentId: string | null; name: string }>(
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
  const sortByName = (a: AccountNode<T>, b: AccountNode<T>) => a.name.localeCompare(b.name);
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
 * Totale di un conto comprensivo dei suoi Pocket, nella valuta base.
 * Serve solo alla visualizzazione del dettaglio conto: non va sommato al
 * totale di patrimonio, che conta ogni conto una volta sola.
 */
export function totalWithChildren(
  accounts: AccountForTotals[],
  accountId: string,
  baseCurrency: string,
  rates: RateMap,
): number {
  const childrenOf = new Map<string, AccountForTotals[]>();
  for (const account of accounts) {
    const key = account.parentId ?? "__root__";
    const list = childrenOf.get(key) ?? [];
    list.push(account);
    childrenOf.set(key, list);
  }
  const collect = (id: string): AccountForTotals[] => {
    const self = accounts.find((a) => a.id === id);
    const children = childrenOf.get(id) ?? [];
    return [...(self ? [self] : []), ...children.flatMap((child) => collect(child.id))];
  };
  return sum(
    collect(accountId)
      .filter((a) => !a.archived)
      .map((a) => ownBalanceInBase(a, baseCurrency, rates) ?? 0),
  );
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
