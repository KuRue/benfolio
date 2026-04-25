import { slugify } from "@/lib/strings";

export const tagCategoryOptions = [
  { value: "CHARACTER", label: "Character" },
  { value: "EVENT", label: "Event" },
  { value: "SPECIES", label: "Species" },
  { value: "MAKER", label: "Maker" },
  { value: "GENERAL", label: "General" },
] as const;

export type TagCategoryValue = (typeof tagCategoryOptions)[number]["value"];

export type TagDraft = {
  id?: string;
  name: string;
  slug?: string;
  category: TagCategoryValue;
};

export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTagSlug(value: string) {
  return slugify(normalizeTagName(value));
}

export function normalizeTagDraft(draft: TagDraft): TagDraft | null {
  const name = normalizeTagName(draft.name);
  const slug = normalizeTagSlug(draft.slug ?? draft.name);

  if (!name || !slug) {
    return null;
  }

  return {
    id: draft.id,
    name,
    slug,
    category: draft.category,
  };
}

export function getTagCategoryLabel(category: TagCategoryValue) {
  return (
    tagCategoryOptions.find((option) => option.value === category)?.label ?? "General"
  );
}

const tagCategorySearchAliases: Record<string, TagCategoryValue> = {
  character: "CHARACTER",
  characters: "CHARACTER",
  char: "CHARACTER",
  event: "EVENT",
  events: "EVENT",
  species: "SPECIES",
  maker: "MAKER",
  makers: "MAKER",
  general: "GENERAL",
  tag: "GENERAL",
  tags: "GENERAL",
};

export function resolveTagSearchCategoryPrefix(value: string) {
  const normalized = normalizeTagName(value).toLowerCase();

  if (normalized in tagCategorySearchAliases) {
    return tagCategorySearchAliases[normalized];
  }

  const directMatch = tagCategoryOptions.find(
    (option) => option.value.toLowerCase() === normalized,
  );

  return directMatch?.value ?? null;
}

export function buildTagSearchQuery(tag: {
  name: string;
  category: TagCategoryValue;
}) {
  const prefix = getTagCategoryLabel(tag.category);
  const name = normalizeTagName(tag.name).replace(/"/g, "'");

  return /\s|:/.test(name) ? `${prefix}:"${name}"` : `${prefix}:${name}`;
}

export function orderTagCategories(categories: TagCategoryValue[]) {
  return [...categories].sort(
    (left, right) =>
      tagCategoryOptions.findIndex((option) => option.value === left) -
      tagCategoryOptions.findIndex((option) => option.value === right),
  );
}

export function groupTagsByCategory(
  tags: Array<{
    id?: string;
    name: string;
    slug?: string;
    category: TagCategoryValue;
  }>,
) {
  const grouped = new Map<
    TagCategoryValue,
    Array<{
      id?: string;
      name: string;
      slug?: string;
      category: TagCategoryValue;
    }>
  >();

  for (const tag of tags) {
    const current = grouped.get(tag.category) ?? [];
    current.push(tag);
    grouped.set(tag.category, current);
  }

  return orderTagCategories([...grouped.keys()]).map((category) => ({
    category,
    label: getTagCategoryLabel(category),
    tags: (grouped.get(category) ?? []).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  }));
}
