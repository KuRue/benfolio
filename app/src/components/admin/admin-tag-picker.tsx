"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { X } from "lucide-react";

import {
  getTagCategoryLabel,
  normalizeTagDraft,
  normalizeTagName,
  tagCategoryOptions,
  type TagCategoryValue,
  type TagDraft,
} from "@/lib/tags";

type AdminTagPickerProps = {
  selectedTags: TagDraft[];
  onChange: (tags: TagDraft[]) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
};

type TagSuggestion = {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
  photoCount: number;
};

function toTagKey(tag: TagDraft) {
  return tag.id ? `id:${tag.id}` : `${tag.category}:${tag.slug ?? tag.name}`;
}

export function AdminTagPicker({
  selectedTags,
  onChange,
  disabled = false,
  placeholder = "Search tags or create a new one",
  label = "Tags",
}: AdminTagPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TagCategoryValue>("GENERAL");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const selectedKeys = useMemo(
    () => new Set(selectedTags.map((tag) => toTagKey(tag))),
    [selectedTags],
  );

  useEffect(() => {
    const normalizedQuery = normalizeTagName(deferredQuery);

    if (!normalizedQuery) {
      return;
    }

    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      q: normalizedQuery,
      limit: "10",
    });

    fetch(`/api/admin/tags?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          tags?: TagSuggestion[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load tags.");
        }

        setSuggestions(payload.tags ?? []);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        console.error(error);
        setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredQuery]);

  function addTag(tag: TagDraft) {
    const normalized = normalizeTagDraft(tag);

    if (!normalized) {
      return;
    }

    if (selectedKeys.has(toTagKey(normalized))) {
      setQuery("");
      setLoading(false);
      return;
    }

    onChange([...selectedTags, normalized]);
    setQuery("");
    setSuggestions([]);
    setLoading(false);
  }

  function removeTag(tag: TagDraft) {
    onChange(selectedTags.filter((candidate) => toTagKey(candidate) !== toTagKey(tag)));
  }

  function createTagFromQuery() {
    if (!query.trim()) {
      return;
    }

    addTag({
      name: query,
      category,
    });
  }

  const normalizedQuery = normalizeTagName(query);
  const hasExactSuggestion = suggestions.some(
    (suggestion) =>
      suggestion.category === category &&
      suggestion.name.localeCompare(normalizedQuery, undefined, {
        sensitivity: "accent",
      }) === 0,
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm text-white/68">{label}</p>
        {selectedTags.length ? (
          <div className="flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <span
                key={toTagKey(tag)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/80"
              >
                <span className="text-white/46">{getTagCategoryLabel(tag.category)}</span>
                <span>{tag.name}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={disabled}
                  className="text-white/56 transition hover:text-white disabled:opacity-40"
                  aria-label={`Remove ${tag.name}`}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/44">
            Selected tags will appear here with their type.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as TagCategoryValue)}
          className="admin-select"
          disabled={disabled}
        >
          {tagCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="relative">
          <input
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setLoading(Boolean(normalizeTagName(nextQuery)));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();

                if (suggestions[0]) {
                  addTag(suggestions[0]);
                  return;
                }

                createTagFromQuery();
              }
            }}
            className="admin-input"
            placeholder={placeholder}
            disabled={disabled}
          />

          {normalizedQuery && !disabled ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#090909]/96 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              {suggestions.length ? (
                <div className="max-h-64 overflow-y-auto py-2">
                  {suggestions.map((suggestion) => {
                    const selected = selectedKeys.has(toTagKey(suggestion));

                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => addTag(suggestion)}
                        disabled={selected}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-white/78 transition hover:bg-white/6 disabled:opacity-45"
                      >
                        <span className="space-y-1">
                          <span className="block">{suggestion.name}</span>
                          <span className="block text-[0.68rem] uppercase tracking-[0.24em] text-white/38">
                            {getTagCategoryLabel(suggestion.category)} · {suggestion.photoCount} photos
                          </span>
                        </span>
                        {selected ? (
                          <span className="text-xs uppercase tracking-[0.22em] text-white/34">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-white/52">
                  {loading ? "Searching tags..." : "No existing tags match yet."}
                </div>
              )}

              {!hasExactSuggestion && normalizedQuery ? (
                <div className="border-t border-white/8 px-4 py-3">
                  <button
                    type="button"
                    onClick={createTagFromQuery}
                    disabled={disabled}
                    className="text-sm text-white/80 transition hover:text-white"
                  >
                    Create <span className="text-white">{normalizedQuery}</span> as{" "}
                    {getTagCategoryLabel(category)}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={createTagFromQuery}
          disabled={disabled || !normalizedQuery}
          className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          Add tag
        </button>
      </div>
    </div>
  );
}
