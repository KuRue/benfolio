"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/duplicates", label: "Duplicates" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/uploads", label: "Uploads" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 rounded-[1.2rem] border border-white/8 bg-white/[0.025] p-1.5">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-2 text-sm transition ${
              active
                ? "bg-white text-black shadow-[0_14px_34px_rgba(255,255,255,0.12)]"
                : "border border-white/10 bg-white/4 text-white/68 hover:border-white/16 hover:bg-white/7 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
