"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Search, X } from "lucide-react";

import {
  getTagCategoryLabel,
  normalizeTagName,
  normalizeTagSlug,
  type TagCategoryValue,
} from "@/lib/tags";

type NoticeState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

type TagLookupSuggestion = {
  id: string;
  name: string;
  slug: string;
  category: TagCategoryValue;
  photoCount: number;
  aliasCount: number;
  matchedAliases?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
};

type AdminTagLookupProps = {
  category: TagCategoryValue;
  excludeTagId: string;
  selectedTag: TagLookupSuggestion | null;
  onSelect: (tag: TagLookupSuggestion | null) => void;
  disabled?: boolean;
};

function AdminTagLookup({
  category,
  excludeTagId,
  selectedTag,
  onSelect,
  disabled = false,
}: AdminTagLookupProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TagLookupSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const normalizedQuery = normalizeTagName(deferredQuery);

    if (!normalizedQuery || disabled) {
      return;
    }

    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      q: normalizedQuery,
      category,
      limit: "8",
      excludeTagId,
    });

    fetch(`/api/admin/tags?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          tags?: TagLookupSuggestion[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to search tags.");
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
  }, [category, deferredQuery, disabled, excludeTagId]);

  return (
    <div className="space-y-3">
      {selectedTag ? (
        <div className="muted-panel px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm text-white">{selectedTag.name}</p>
              <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                {getTagCategoryLabel(selectedTag.category)} · {selectedTag.photoCount} photos
                {selectedTag.aliasCount ? ` · ${selectedTag.aliasCount} aliases` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setQuery("");
                setSuggestions([]);
              }}
              disabled={disabled}
              className="admin-button-muted px-3 py-1.5 text-xs uppercase tracking-[0.24em]"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/36">
          <Search size={16} />
        </div>
        <input
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            const normalizedNextQuery = normalizeTagName(nextQuery);

            setQuery(nextQuery);
            setLoading(Boolean(normalizedNextQuery));

            if (!normalizedNextQuery) {
              setSuggestions([]);
            }
          }}
          className="admin-input pl-11"
          placeholder={`Find a ${getTagCategoryLabel(category).toLowerCase()} tag to merge into`}
          disabled={disabled}
        />

        {normalizeTagName(query) && !disabled ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#090909]/96 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {suggestions.length ? (
              <div className="max-h-72 overflow-y-auto py-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => {
                      onSelect(suggestion);
                      setQuery("");
                      setSuggestions([]);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-white/78 transition hover:bg-white/6"
                  >
                    <span className="space-y-1">
                      <span className="block">{suggestion.name}</span>
                      <span className="block text-[0.68rem] uppercase tracking-[0.24em] text-white/38">
                        {suggestion.photoCount} photos
                        {suggestion.aliasCount ? ` · ${suggestion.aliasCount} aliases` : ""}
                      </span>
                      {suggestion.matchedAliases?.length ? (
                        <span className="block text-xs text-white/46">
                          Alias match:{" "}
                          {suggestion.matchedAliases.map((alias) => alias.name).join(", ")}
                        </span>
                      ) : null}
                    </span>
                    <ArrowRightLeft size={15} className="text-white/34" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-white/52">
                {loading ? "Searching tags..." : "No merge target matches yet."}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type AdminTagGovernancePanelProps = {
  tag: {
    id: string;
    name: string;
    slug: string;
    category: TagCategoryValue;
    photoCount: number;
    aliasCount: number;
    aliases: Array<{
      id: string;
      name: string;
      slug: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  confusableTagCount: number;
};

export function AdminTagGovernancePanel({
  tag,
  confusableTagCount,
}: AdminTagGovernancePanelProps) {
  const router = useRouter();
  const [name, setName] = useState(tag.name);
  const [slug, setSlug] = useState(tag.slug);
  const [aliasName, setAliasName] = useState("");
  const [aliasSlug, setAliasSlug] = useState("");
  const [mergeTarget, setMergeTarget] = useState<TagLookupSuggestion | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  async function refreshCurrentPage(message: string) {
    setNotice({
      tone: "success",
      text: message,
    });
    startTransition(() => {
      router.refresh();
    });
  }

  async function renameCurrentTag() {
    const normalizedName = normalizeTagName(name);
    const normalizedSlug = normalizeTagSlug(slug || name);

    if (!normalizedName || !normalizedSlug) {
      setNotice({
        tone: "error",
        text: "Name and slug are required.",
      });
      return;
    }

    if (normalizedName === tag.name && normalizedSlug === tag.slug) {
      setNotice({
        tone: "error",
        text: "No changes to save yet.",
      });
      return;
    }

    const conflictWarning = confusableTagCount
      ? ` ${confusableTagCount} similar tags already exist in this category.`
      : "";

    if (
      !window.confirm(
        `Rename this ${getTagCategoryLabel(tag.category).toLowerCase()} tag for ${tag.photoCount} linked photos?${conflictWarning}`,
      )
    ) {
      return;
    }

    setPendingAction("rename");
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/tags/${tag.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          slug: normalizedSlug,
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to rename tag.");
      }

      await refreshCurrentPage(payload.message ?? "Tag renamed.");
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to rename tag.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function createAlias() {
    const normalizedName = normalizeTagName(aliasName);
    const normalizedSlug = normalizeTagSlug(aliasSlug || aliasName);

    if (!normalizedName || !normalizedSlug) {
      setNotice({
        tone: "error",
        text: "Alias name and slug are required.",
      });
      return;
    }

    setPendingAction("add-alias");
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/tags/${tag.id}/aliases`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          slug: normalizedSlug,
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to add alias.");
      }

      setAliasName("");
      setAliasSlug("");
      await refreshCurrentPage(payload.message ?? "Alias added.");
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to add alias.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function removeAlias(aliasId: string, aliasLabel: string) {
    if (!window.confirm(`Remove alias ${aliasLabel}?`)) {
      return;
    }

    setPendingAction(`remove-alias:${aliasId}`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/tags/${tag.id}/aliases/${aliasId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove alias.");
      }

      await refreshCurrentPage(payload.message ?? "Alias removed.");
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to remove alias.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function mergeIntoSelectedTag() {
    if (!mergeTarget) {
      setNotice({
        tone: "error",
        text: "Choose a destination tag first.",
      });
      return;
    }

    if (
      !window.confirm(
        `Merge ${tag.name} (${tag.photoCount} photos) into ${mergeTarget.name} (${mergeTarget.photoCount} photos)? Photo links stay intact and the old canonical name becomes an alias when possible.`,
      )
    ) {
      return;
    }

    setPendingAction("merge");
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/tags/${tag.id}/merge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          destinationTagId: mergeTarget.id,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        destinationTagId?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to merge tags.");
      }

      setNotice({
        tone: "success",
        text: payload.message ?? "Tags merged.",
      });
      startTransition(() => {
        router.push(`/admin/tags/${payload.destinationTagId ?? mergeTarget.id}`);
        router.refresh();
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to merge tags.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="admin-card space-y-6 px-6 py-6">
      <div className="space-y-2">
        <p className="editorial-label">Governance</p>
        <h2 className="font-serif text-3xl tracking-[-0.03em] text-white">
          Canonical tag
        </h2>
        <p className="max-w-3xl text-sm text-white/58">
          Rename, add aliases, or merge safely.
        </p>
      </div>

      {notice ? (
        <p className={notice.tone === "success" ? "admin-note" : "admin-note-error"}>
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="muted-panel space-y-4 px-5 py-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-white/38">Rename</p>
            <h3 className="font-serif text-2xl text-white">Canonical label</h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-white/62">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="admin-input"
                disabled={pendingAction !== null}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-white/62">Slug</span>
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="admin-input"
                disabled={pendingAction !== null}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-white/54">
              Category stays <span className="text-white/76">{getTagCategoryLabel(tag.category)}</span>.
            </p>
            <button
              type="button"
              onClick={() => void renameCurrentTag()}
              disabled={pendingAction !== null}
              className="admin-button disabled:opacity-40"
            >
              {pendingAction === "rename" ? "Saving..." : "Save rename"}
            </button>
          </div>
        </div>

        <div className="muted-panel space-y-4 px-5 py-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-white/38">Aliases</p>
            <h3 className="font-serif text-2xl text-white">Aliases</h3>
          </div>

          {tag.aliases.length ? (
            <div className="flex flex-wrap gap-2">
              {tag.aliases.map((alias) => (
                <span
                  key={alias.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/78"
                >
                  <span>{alias.name}</span>
                  <span className="text-white/34">/{alias.slug}</span>
                  <button
                    type="button"
                    onClick={() => void removeAlias(alias.id, alias.name)}
                    disabled={pendingAction !== null}
                    className="text-white/52 transition hover:text-white disabled:opacity-40"
                    aria-label={`Remove alias ${alias.name}`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/46">
              No aliases yet. Add alternate spellings, nicknames, or sync-friendly labels here.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-white/62">Alias name</span>
              <input
                value={aliasName}
                onChange={(event) => setAliasName(event.target.value)}
                className="admin-input"
                placeholder="Kurü"
                disabled={pendingAction !== null}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-white/62">Alias slug</span>
              <input
                value={aliasSlug}
                onChange={(event) => setAliasSlug(event.target.value)}
                className="admin-input"
                placeholder={aliasName ? normalizeTagSlug(aliasName) : "kuru"}
                disabled={pendingAction !== null}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void createAlias()}
              disabled={pendingAction !== null}
              className="admin-button-muted"
            >
              {pendingAction === "add-alias" ? "Adding..." : "Add alias"}
            </button>
          </div>
        </div>
      </div>

      <div className="muted-panel space-y-4 px-5 py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-white/38">Merge</p>
          <h3 className="font-serif text-2xl text-white">Fold duplicates into one canonical tag</h3>
        </div>

        <p className="text-sm leading-7 text-white/58">
          Merge this tag into another {getTagCategoryLabel(tag.category).toLowerCase()} tag to move
          every photo association and preserve the old wording as an alias when that remains safe.
        </p>

        <AdminTagLookup
          category={tag.category}
          excludeTagId={tag.id}
          selectedTag={mergeTarget}
          onSelect={setMergeTarget}
          disabled={pendingAction !== null}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/46">
            Need a quick library view first?{" "}
            <Link href="/admin/tags" className="text-white/76 underline decoration-white/20">
              Browse tags
            </Link>
          </p>
          <button
            type="button"
            onClick={() => void mergeIntoSelectedTag()}
            disabled={pendingAction !== null || !mergeTarget}
            className="rounded-full border border-[#c5965c]/25 bg-[#c5965c]/10 px-4 py-2 text-sm text-[#f3d1aa] disabled:opacity-40"
          >
            {pendingAction === "merge" ? "Merging..." : "Merge into selected tag"}
          </button>
        </div>
      </div>
    </section>
  );
}
