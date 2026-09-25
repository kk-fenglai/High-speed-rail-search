"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "价格一览" },
  { href: "/changes/", label: "变更日志" },
  { href: "/mine/", label: "我的订阅" },
];

export function Nav() {
  const pathname = usePathname();
  const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);
  return (
    <nav className="nav" aria-label="主导航">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={norm(pathname) === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
