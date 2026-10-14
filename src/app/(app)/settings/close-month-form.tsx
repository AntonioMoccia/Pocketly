"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { closeMonthAction } from "@/app/actions/envelopes";
import { idleState } from "@/lib/action-state";
import { Badge, Button } from "@/components/ui";

/**
 * Chiusura del mese (F1.5.9): applica le politiche avanzi una volta sola e
 * genera i giroconti necessari.
 */
export function CloseMonthForm({ month, closed }: { month: string; closed: boolean }) {
  const t = useTranslations("month");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(closeMonthAction, idleState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="month" value={month} />

      {closed ? (
        <Badge tone="good">{t("alreadyClosed")}</Badge>
      ) : (
        <p className="text-sm text-ink-secondary">{t("description")}</p>
      )}

      {state.status === "success" ? (
        <p className="text-sm font-medium text-good" role="status">
          {state.messageKey === "month.alreadyClosed"
            ? t("alreadyClosed")
            : t("closedResult", {
                sweeps: Number(state.messageValues?.sweeps ?? 0),
                transfers: Number(state.messageValues?.transfers ?? 0),
              })}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {tCommon("error")}
        </p>
      ) : null}

      <Button type="submit" variant="outline" disabled={pending || closed}>
        {pending ? tCommon("saving") : t("close")}
      </Button>
    </form>
  );
}
