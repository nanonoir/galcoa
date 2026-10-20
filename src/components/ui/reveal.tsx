"use client";

import { useEffect, useRef, type ComponentProps } from "react";

type RevealProps = ComponentProps<"div"> & {
  as?: "div" | "section";
  /** Retardo en ms (máx. recomendado 120): se usa solo para escalonar hermanos cercanos. */
  delay?: number;
};

/**
 * Revelado único al entrar en pantalla (plan movimiento-profesional). El HTML
 * se renderiza visible; solo después de hidratar se ocultan los bloques que ya
 * están por debajo del viewport, y se muestran una vez al intersectar. Sin
 * `IntersectionObserver`, con JS apagado o al imprimir, el contenido queda visible.
 * El estado vive en `data-reveal` (DOM directo) para no volver a renderizar ni
 * tocar a los hijos.
 */
export function Reveal({ as: Tag = "div", delay, className, style, children, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        el.dataset.reveal = "shown";
        observer.disconnect();
      },
      // Frontera 0: coincide con la guarda inicial (top < innerHeight); un margen negativo
      // dejaría invisible contenido que ya asoma por el borde inferior.
      { rootMargin: "0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      delete el.dataset.reveal;
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={`motion-reveal${className ? ` ${className}` : ""}`}
      style={delay ? { ...style, ["--enter-delay" as string]: `${delay}ms` } : style}
      {...props}
    >
      {children}
    </Tag>
  );
}
