import Link from "next/link";

import { getAdminTagBrowserData } from "@/lib/admin-tag-governance";
import { formatShortDate } from "@/lib/strings";
import { getTagCategoryLabel, tagCategoryOptions } from "@/lib/tags";

type AdminTagsPageProps = {
  searchParams: Promise<{
    category?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
};

function buildHref(args: {
  category: string;
  q: string;
  sort: string;
  page: number;
}) {
  const params = new URLSearchParams();

  if (args.category !== "ALL") {
    params.set("category", args.category);
  }

  if (args.q) {
    params.set("q", args.q);
  }

  if (args.sort !== "recent") {
    params.set("sort", args.sort);
  }

  if (args.page > 1) {
    params.set("page", String(args.page));
  }

  return `/admin/tags${params.size ? `?${params.toString()}` : ""}`;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminTagsPage({
  searchParams,
}: AdminTagsPageProps) {
  const { category, q, sort, page } = await searchParams;
  const data = await getAdminTagBrowserData({
    category,
    q,
    sort,
    page,
  });

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="editorial-label">Tag Library</p>
        <h1 className="font-serif text-3xl tracking-[-0.03em] text-white sm:text-[2.45rem]">
          Tags
        </h1>
      </section>

      <section className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="editorial-label">Filters</p>
          <p className="text-sm text-white/54">
            {data.pagination.totalCount} tags
          </p>
        </div>

        <form
          action="/admin/tags"
          method="get"
          className="grid gap-3 xl:grid-cols-[13rem_minmax(0,1fr)_12rem_auto]"
        >
          <select
            name="category"
            defaultValue={data.filters.category}
            className="admin-select"
          >
            <option value="ALL">All categories</option>
            {tagCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            name="q"
            defaultValue={data.filters.query}
            className="admin-input"
            placeholder="Search canonical names, slugs, or aliases"
          />

          <select name="sort" defaultValue={data.filters.sort} className="admin-select">
            <option value="recent">Recent activity</option>
            <option value="usage">Usage count</option>
            <option value="name">Name</option>
          </select>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Apply
            </button>
            <Link
              href="/admin/tags"
              className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
            >
              Clear
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.24em] text-white/38">
          {tagCategoryOptions.map((option) => (
            <span
              key={option.value}
              className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5"
            >
              {option.label}: {data.summary.byCategory[option.value] ?? 0}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="editorial-label">Results</p>
          <div className="text-sm text-white/58">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </div>
        </div>

        {data.tags.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/admin/tags/${tag.id}`}
                className="admin-card grid gap-4 rounded-[1.4rem] px-5 py-5 transition hover:border-white/16 hover:bg-white/[0.055] md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                      {getTagCategoryLabel(tag.category)}
                    </span>
                    {tag.aliasCount ? (
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/66">
                        {tag.aliasCount} alias{tag.aliasCount === 1 ? "" : "es"}
                      </span>
                    ) : null}
                    {tag.photoCount ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-emerald-100">
                        In use
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/52">
                        Unused
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-serif text-3xl tracking-[-0.03em] text-white">
                      {tag.name}
                    </h3>
                    <p className="font-mono text-sm text-white/54">/{tag.slug}</p>
                  </div>

                  <p className="text-sm leading-7 text-white/56">
                    {tag.photoCount} photo{tag.photoCount === 1 ? "" : "s"} linked
                    {tag.aliasCount
                      ? ` · ${tag.aliasCount} alias${tag.aliasCount === 1 ? "" : "es"}`
                      : ""}
                  </p>

                  {tag.aliases.length ? (
                    <div className="flex flex-wrap gap-2">
                      {tag.aliases.map((alias) => (
                        <span
                          key={alias.id}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/74"
                        >
                          <span>{alias.name}</span>
                          <span className="text-white/34">/{alias.slug}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 text-right text-sm text-white/52">
                  <div>
                    <p>Active</p>
                    <p className="mt-1 text-white/76">{formatDateTime(tag.updatedAt)}</p>
                  </div>
                  <div>
                    <p>Created</p>
                    <p className="mt-1 text-white/76">{formatShortDate(tag.createdAt)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-card px-6 py-10 text-center text-sm text-white/58">
            No tags match these filters.
          </div>
        )}
      </section>

      {data.pagination.totalPages > 1 ? (
        <nav className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/8 bg-white/4 px-5 py-4 text-sm text-white/68">
          <Link
            href={buildHref({
              category: data.filters.category,
              q: data.filters.query,
              sort: data.filters.sort,
              page: Math.max(1, data.pagination.page - 1),
            })}
            className={`rounded-full border px-4 py-2 ${
              data.pagination.hasPreviousPage
                ? "border-white/10 bg-white/4 text-white/72"
                : "pointer-events-none border-white/6 bg-white/[0.02] text-white/28"
            }`}
          >
            Previous
          </Link>
          <p>
            Page {data.pagination.page} of {data.pagination.totalPages}
          </p>
          <Link
            href={buildHref({
              category: data.filters.category,
              q: data.filters.query,
              sort: data.filters.sort,
              page: Math.min(data.pagination.totalPages, data.pagination.page + 1),
            })}
            className={`rounded-full border px-4 py-2 ${
              data.pagination.hasNextPage
                ? "border-white/10 bg-white/4 text-white/72"
                : "pointer-events-none border-white/6 bg-white/[0.02] text-white/28"
            }`}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
