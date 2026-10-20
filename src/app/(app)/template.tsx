/**
 * Entrada breve del contenido al navegar (plan movimiento-profesional). El
 * encabezado del layout no se anima ni se remonta; solo la página nueva entra
 * con opacidad y 8px de desplazamiento. No espera datos ni retrasa la navegación,
 * y conserva el alto completo que necesitan las páginas hijas.
 */
export default function PrivateTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-enter flex flex-1 flex-col">{children}</div>;
}
