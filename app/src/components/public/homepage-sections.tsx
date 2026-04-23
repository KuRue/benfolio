"use client";

import {
  ImageIcon,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  type ReactNode,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from "react";

type SectionId = "albums" | "highlights" | "about";

type HomepageSectionsProps = {
  albums: ReactNode;
  highlights: ReactNode;
  about: ReactNode;
};

const sections: Array<{
  id: SectionId;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "albums", label: "Albums", Icon: ImageIcon },
  { id: "highlights", label: "Highlights", Icon: Sparkles },
  { id: "about", label: "About", Icon: UserRound },
];

export function HomepageSections({
  albums,
  highlights,
  about,
}: HomepageSectionsProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("albums");
  const activeIndex = useMemo(
    () => sections.findIndex((section) => section.id === activeSection),
    [activeSection],
  );

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!elements.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visible?.target.id) {
          startTransition(() => {
            setActiveSection(visible.target.id as SectionId);
          });
        }
      },
      {
        rootMargin: "-28% 0px -55% 0px",
        threshold: [0.12, 0.3, 0.55],
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  function scrollToSection(id: SectionId) {
    startTransition(() => {
      setActiveSection(id);
    });

    const target = document.getElementById(id);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    target?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  const sectionContent: Record<SectionId, ReactNode> = {
    albums,
    highlights,
    about,
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <nav
        className="sticky top-3 z-20 mx-auto grid max-w-4xl grid-cols-3 overflow-hidden rounded-full border border-white/14 bg-[#0b0b0d]/64 p-1.5 text-sm text-white/62 shadow-[0_26px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-12 before:bg-[radial-gradient(ellipse_at_top,_rgba(147,129,255,0.42),_rgba(43,196,255,0.14)_34%,_transparent_76%)] before:blur-xl before:content-[''] relative"
        aria-label="Homepage sections"
      >
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1.5 rounded-full border border-white/12 bg-white/[0.105] shadow-[0_16px_46px_rgba(125,107,255,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: "calc((100% - 0.75rem) / 3)",
            transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
          }}
        />
        {sections.map(({ id, label, Icon }) => {
          const isActive = activeSection === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollToSection(id)}
              className={`relative z-10 flex items-center justify-center gap-2 rounded-full px-3 py-3 transition duration-300 ${
                isActive
                  ? "text-white"
                  : "text-white/58 hover:text-white focus-visible:text-white"
              }`}
              aria-controls={id}
              aria-pressed={isActive}
            >
              <Icon
                className={`h-4 w-4 transition duration-300 ${
                  isActive
                    ? "text-[#a097ff] drop-shadow-[0_0_12px_rgba(150,136,255,0.55)]"
                    : "text-white/52"
                }`}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-9 sm:space-y-11">
        {sections.map(({ id }) => (
          <section
            key={id}
            id={id}
            className={`scroll-mt-28 transition duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              activeSection === id
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-80"
            }`}
          >
            {sectionContent[id]}
          </section>
        ))}
      </div>
    </div>
  );
}
