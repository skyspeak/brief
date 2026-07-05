"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/newsletters", label: "Inbox", icon: "📬" },
  { href: "/confirm", label: "Setup", icon: "⚙️" },
];

export default function AppShell({ children }) {
  const path = usePathname();

  return (
    <div className="app">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Link href="/" className="app-brand">
            The Brief
          </Link>
          <nav className="app-topnav" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={path === item.href ? "active" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="app-bottomnav" aria-label="Mobile">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={path === item.href ? "active" : undefined}
          >
            <span className="app-bottomnav-icon" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
