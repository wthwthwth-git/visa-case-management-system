import jaTranslations from "@/data/visa-templates/visa-template-translations-ja.json";
import templateCatalog from "@/data/visa-templates/visa-template-catalog.json";
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

type TemplateCatalog = {
  templates: Array<{
    templateKey: string;
    version: number;
    items?: Array<{
      itemKey: string;
      title?: string | null;
    }>;
  }>;
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
const visaTemplateCatalog = templateCatalog as TemplateCatalog;
let jaMaterialTitleBySourceTitle: Map<string, string> | null = null;

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

function getJaMaterialTitleBySourceTitle() {
  if (jaMaterialTitleBySourceTitle) {
    return jaMaterialTitleBySourceTitle;
  }

  const titleMap = new Map<string, string>();

  for (const template of visaTemplateCatalog.templates) {
    const translation = jaTemplateTranslations.templates[templateTranslationKey(template)];

    if (!translation?.items) {
      continue;
    }

    for (const item of template.items ?? []) {
      const sourceTitle = item.title?.trim();
      const translatedTitle = translation.items[item.itemKey]?.title?.trim();

      if (!sourceTitle || !translatedTitle || titleMap.has(sourceTitle)) {
        continue;
      }

      titleMap.set(sourceTitle, translatedTitle);
    }
  }

  jaMaterialTitleBySourceTitle = titleMap;
  return titleMap;
}

function translateCustomRequirementTitle(title: string, locale: AppLocale) {
  if (locale !== "ja") {
    return title;
  }

  return title.replace(/^追加资料(\d*)$/, (_match, number) => `追加資料${number}`);
}

export function displayLocalizedRequirementTitle(title: string | null | undefined, locale: AppLocale) {
  const sourceTitle = title?.trim() ?? "";

  if (!sourceTitle) {
    return "";
  }

  if (locale === "ja") {
    return getJaMaterialTitleBySourceTitle().get(sourceTitle) ?? translateCustomRequirementTitle(sourceTitle, locale);
  }

  return sourceTitle;
}
