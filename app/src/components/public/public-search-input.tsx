"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

type PublicSearchInputProps = {
  /** The query value present in the URL on the server-rendered page. */
  initialQuery: string;
};

/**
 * URL-driven search input for the public /search results page. Submitting
 * (Enter or the form's submit) navigates to /search?query=... so the
 * server re-renders results. The launcher modal still handles the
 * real-time popup; this is the "expanded view" complement.
 */
export function PublicSearchInput({ initialQuery }: PublicSearchInputProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  // Keep the input in sync if the URL changes from outside (back/forward
  // navigation, link click, launcher result navigation, etc).
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function submit(nextQuery: string) {
    const trimmed = nextQuery.trim();
    const target = trimmed
      ? `/search?query=${encodeURIComponent(trimmed)}`
      : "/search";
    startTransition(() => {
      router.push(target, { scroll: false });
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(query);
      }}
      className="flex items-center gap-3 rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-3 transition focus-within:border-white/24 focus-within:bg-white/[0.07] sm:px-5 sm:py-3.5"
      role="search"
    >
      <Search size={18} className="shrink-0 text-white/50" aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by character, event, year, species, maker, or general tag"
        className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/34 sm:text-lg"
        autoComplete="off"
        autoFocus={!initialQuery}
        aria-label="Search public photos"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            submit("");
          }}
          className="shrink-0 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      ) : null}
    </form>
  );
}
