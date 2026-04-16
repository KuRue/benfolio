/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTagGovernancePanel } from "@/components/admin/admin-tag-governance-panel";
import { getAdminTagDetailData } from "@/lib/admin-tag-governance";
import { formatShortDate } from "@/lib/strings";
import { getTagCategoryLabel } from "@/lib/tags";

type AdminTagDetailPageProps = {
  params: Promise<{
    tagId: string;
  }>;
};

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminTagDetailPage({
  params,
}: AdminTagDetailPageProps) {
  const { tagId } = await params;
  const data = await getAdminTagDetailData(tagId);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Link
          href="/admin/tags"
          className="inline-flex rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
        >
          Back to tags
        </Link>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
              {getTagCategoryLabel(data.tag.category)}
            </span>
            {data.tag.aliasCount ? (
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/66">
                {data.tag.aliasCount} alias{data.tag.aliasCount === 1 ? "" : "es"}
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
              {data.tag.name}
            </h1>
            <p className="font-mono text-sm text-white/54">/{data.tag.slug}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.24em] text-white/42">
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5">
              {data.tag.photoCount} photos
            </span>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5">
              {data.tag.aliasCount} aliases
            </span>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5">
              {data.linkedEvents.length} events
            </span>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5">
              {data.confusableTags.length} hints
            </span>
          </div>
        </div>
      </section>

      <AdminTagGovernancePanel
        tag={{
          id: data.tag.id,
          name: data.tag.name,
          slug: data.tag.slug,
          category: data.tag.category,
          photoCount: data.tag.photoCount,
          aliasCount: data.tag.aliasCount,
          aliases: data.tag.aliases.map((alias) => ({
            id: alias.id,
            name: alias.name,
            slug: alias.slug,
            createdAt: alias.createdAt.toISOString(),
            updatedAt: alias.updatedAt.toISOString(),
          })),
        }}
        confusableTagCount={data.confusableTags.length}
      />

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <article className="admin-card space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-1.5">
            <p className="editorial-label">Usage</p>
            <h2 className="font-serif text-[2rem] tracking-[-0.03em] text-white">
              Photos
            </h2>
          </div>

          {data.examplePhotos.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {data.examplePhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="rounded-[1.4rem] border border-white/8 bg-white/4 p-4"
                >
                  <div className="overflow-hidden rounded-[1rem] bg-[#0b0b0b]">
                    {photo.previewUrl ? (
                      <img
                        src={photo.previewUrl}
                        alt={photo.altText ?? photo.caption ?? photo.originalFilename}
                        className="aspect-[4/5] w-full object-cover"
                      />
                    ) : (
                      <div className="aspect-[4/5] w-full bg-[linear-gradient(145deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))]" />
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {photo.isCover ? (
                        <span className="glass-chip px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white">
                          Event cover
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white/62">
                        {photo.event.slug}
                      </span>
                    </div>
                    <p className="text-sm text-white">{photo.originalFilename}</p>
                    <p className="text-sm text-white/56">{photo.caption ?? photo.altText ?? "No caption set"}</p>
                    <p className="text-xs uppercase tracking-[0.24em] text-white/40">
                      Effective taken {formatDateTime(photo.effectiveTakenAt)} · added{" "}
                      {formatDateTime(photo.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link
                        href={`/p/${photo.id}`}
                        className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
                      >
                        Open photo
                      </Link>
                      <Link
                        href={`/admin/events/${photo.event.id}`}
                        className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-white/72"
                      >
                        Open event
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.3rem] border border-white/8 bg-white/4 px-5 py-8 text-center text-sm text-white/56">
              No photos use this tag yet.
            </div>
          )}
        </article>

        <div className="space-y-6">
          <article className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-1.5">
              <p className="editorial-label">Events</p>
              <h2 className="font-serif text-[2rem] tracking-[-0.03em] text-white">
                Events
              </h2>
            </div>

            {data.linkedEvents.length ? (
              <div className="grid gap-3">
                {data.linkedEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/admin/events/${event.id}`}
                    className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-4 transition hover:border-white/16 hover:bg-white/[0.055]"
                  >
                    <p className="text-sm text-white">{event.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/40">
                      {event.slug} · {formatShortDate(event.eventDate)}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/56">No linked events yet.</p>
            )}
          </article>

          <article className="admin-card space-y-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-1.5">
              <p className="editorial-label">Hints</p>
              <h2 className="font-serif text-[2rem] tracking-[-0.03em] text-white">
                Similar tags
              </h2>
            </div>

            {data.confusableTags.length ? (
              <div className="grid gap-3">
                {data.confusableTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/admin/tags/${tag.id}`}
                    className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-4 transition hover:border-white/16 hover:bg-white/[0.055]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-white">{tag.name}</p>
                        <p className="mt-1 font-mono text-xs text-white/42">/{tag.slug}</p>
                      </div>
                      <div className="text-right text-xs uppercase tracking-[0.22em] text-white/42">
                        <p>{tag.photoCount} photos</p>
                        <p>{tag.aliasCount} aliases</p>
                      </div>
                    </div>
                    {tag.matchedAliases.length ? (
                      <p className="mt-3 text-xs text-white/50">
                        Alias overlap: {tag.matchedAliases.map((alias) => alias.name).join(", ")}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/56">No obvious confusable tags here.</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
