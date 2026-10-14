/**
 * Modelli di ripartizione letti dall'API.
 */
import { api, ApiError } from "@/lib/api";
import type { TemplateInput, TemplateSummary, TemplateWithLines } from "@api/data/templates";

export type { TemplateInput, TemplateSummary, TemplateWithLines };

export function listTemplates(): Promise<TemplateSummary[]> {
  return api.get<TemplateSummary[]>("/templates");
}

export async function getTemplate(templateId: string): Promise<TemplateWithLines | null> {
  try {
    return await api.get<TemplateWithLines>(`/templates/${encodeURIComponent(templateId)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function defaultTemplate(): Promise<TemplateWithLines | null> {
  const { template } = await api.get<{ template: TemplateWithLines | null }>("/templates/default");
  return template;
}
