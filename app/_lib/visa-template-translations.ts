import jaTranslations from "@/data/visa-templates/visa-template-translations-ja.json";
import type { AppLocale } from "./i18n";

type TemplateTranslationItem = {
  title?: string | null;
  customerInstruction?: string | null;
};

type TemplateTranslation = {
  title?: string | null;
  items?: Record<string, TemplateTranslationItem | undefined>;
};

type TemplateTranslationCatalog = {
  templates: Record<string, TemplateTranslation | undefined>;
};

type TemplateRef = {
  templateKey: string;
  version: number;
  title?: string | null;
};

type TemplateItemRef = {
  itemKey: string;
  title?: string | null;
  customerInstruction?: string | null;
};

const jaTemplateTranslations = jaTranslations as TemplateTranslationCatalog;

function templateTranslationKey(template: TemplateRef) {
  return `${template.templateKey}:${template.version}`;
}

function getTemplateTranslation(template: TemplateRef, locale: AppLocale) {
  if (locale !== "ja") {
    return null;
  }

  return jaTemplateTranslations.templates[templateTranslationKey(template)] ?? null;
}

export function displayVisaTemplateTitle(template: TemplateRef, locale: AppLocale) {
  return getTemplateTranslation(template, locale)?.title?.trim() || template.title || "";
}

export function displayVisaTemplateItemTitle(
  template: TemplateRef,
  item: TemplateItemRef,
  locale: AppLocale,
) {
  return getTemplateTranslation(template, locale)?.items?.[item.itemKey]?.title?.trim() || item.title || "";
}

export function displayVisaTemplateItemInstruction(
  template: TemplateRef,
  item: TemplateItemRef,
  locale: AppLocale,
) {
  return (
    getTemplateTranslation(template, locale)?.items?.[item.itemKey]?.customerInstruction?.trim() ||
    item.customerInstruction ||
    ""
  );
}
