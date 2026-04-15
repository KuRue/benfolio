"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/duplicates", label: "Duplicates" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/uploads", label: "Uploads" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-2 text-sm ${
              active
                ? "bg-white text-black"
                : "border border-white/10 bg-white/4 text-white/68"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
