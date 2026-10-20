/** Entrada breve del formulario al cambiar de pantalla de acceso; la marca y el aside del layout permanecen. */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-enter flex flex-col gap-4">{children}</div>;
}
