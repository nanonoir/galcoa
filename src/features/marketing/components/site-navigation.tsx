"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import type { LandingContent, NavLink } from "@/lib/contracts/landing";

/**
 * Barra de navegación de la landing (MVP-114, REQ-02). Los destinos llegan como
 * datos (`NavLink`): el componente no fija rutas ni usa `next/link`. En móvil los
 * enlaces se despliegan con el botón «Menú» (estado visual local); al cerrarlo
 * con el botón o con Escape el foco vuelve al botón. En escritorio se ven en línea.
 */

export interface SiteNavigationProps {
  brand: string;
  links: readonly NavLink[];
}

/** Arma las props de la navegación a partir del contenido de la landing. */
export function siteNavigationProps(content: LandingContent): SiteNavigationProps {
  return { brand: content.brand, links: content.navigation };
}

const linkClass =
  "rounded-md px-2 py-1.5 text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export function SiteNavigation({ brand, links }: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = `${useId()}-menu`;

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) toggle.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  return (
    <header className="border-b">
      <nav aria-label="Principal" onKeyDown={handleKeyDown} className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-base font-semibold">{brand}</span>

          <ul className="hidden items-center gap-2 md:flex">
            {links.map((link) => (
              <li key={`${link.href}-${link.label}`}>
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <Button
            ref={toggle}
            type="button"
            variant="outline"
            className="md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => (open ? close(true) : setOpen(true))}
          >
            Menú
          </Button>
        </div>

        {open && (
          <ul id={menuId} aria-label="Menú" className="flex flex-col gap-1 border-t pt-2 md:hidden">
            {links.map((link) => (
              <li key={`${link.href}-${link.label}`}>
                {/* Elegir un destino cierra el menú; la navegación sigue al enlace. */}
                <a href={link.href} className={`${linkClass} block`} onClick={() => close(false)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </header>
  );
}
