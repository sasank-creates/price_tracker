'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="header">
      <div className="container header-inner">
        <div className="logo">
          <div className="logo-icon">📊</div>
          <span className="logo-text">PriceTracker</span>
        </div>
        <nav className="nav-links">
          <Link
            href="/"
            className={`nav-link ${pathname === '/' ? 'active' : ''}`}
          >
            Dashboard
          </Link>
          <Link
            href="/admin"
            className={`nav-link ${pathname === '/admin' ? 'active' : ''}`}
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
