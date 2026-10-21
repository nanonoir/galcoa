import "server-only";

import { createHash } from "node:crypto";

import { Document, Image, Page, Path, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { create as createQr } from "qrcode";

import { OperationContentSchema, type OperationContent } from "@/lib/contracts/core";
import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
import { FrozenContentSchema, type FrozenContent } from "@/lib/contracts/review";
import type { Receipt } from "@/lib/contracts/version";

import { receiptsHeadline } from "../finalization/receipts";
import { GALCOA_LOGO_PNG } from "./logo";

/**
 * PDF final (MVP-081). Se renderiza en el servidor desde el **snapshot
 * persistido** (nunca desde el borrador, la IA ni el navegador): primero la
 * operación acordada tal cual, después el anexo «Constancias de
 * confirmación». Metadatos fijos (fecha = finalización, productor estable)
 * para no meter el reloj en los bytes. Lenguaje de declaración por enlace,
 * sin términos de certificación ni de identidad comprobada.
 *
 * v2: encabezado con logo, fecha legible y semáforo; datos en tabla; pie con
 * QR y enlace al verificador público. Logo y QR se generan sin red ni reloj,
 * así que el mismo snapshot sigue dando los mismos bytes.
 */

export const RENDERER_VERSION = "galcoa-pdf-v2";

const ROLE_LABEL = { autor: "Autor", intermediario: "Intermediario", comprador: "Comprador" } as const;
/** Snapshots v2: los roles internos se muestran como proveedor / transportista / comprador. */
const ROLE_LABEL_V2 = { autor: "Proveedor", intermediario: "Transportista", comprador: "Comprador" } as const;

const ALC_COLOR_LABEL = { verde: "VERDE", amarillo: "AMARILLO", rojo: "ROJO" } as const;
/** Texto corto para la columna «Estado» de la tabla de datos. */
const ALC_STATUS_SHORT = {
  declarado: "Declarado",
  confirmado: "Confirmado",
  contradicho: "Contradicho",
  ambiguo: "Ambiguo",
} as const;

const C = {
  navy: "#1E3A5F",
  green: "#176A57",
  yellow: "#FFDA47",
  ink: "#0B1220",
  muted: "#5B6678",
  line: "#D5DBE3",
  zebra: "#F4F6F9",
  danger: "#B42318",
} as const;

const BADGE = {
  verde: { backgroundColor: C.green, color: "#FFFFFF" },
  amarillo: { backgroundColor: C.yellow, color: C.navy },
  rojo: { backgroundColor: C.danger, color: "#FFFFFF" },
} as const;

const STATUS_COLOR = { confirmado: C.green, declarado: C.muted, contradicho: C.danger, ambiguo: C.danger } as const;

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 116, fontSize: 10.5, fontFamily: "Helvetica", lineHeight: 1.4, color: C.ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: C.yellow },
  logo: { width: 112, height: 37 },
  headerTag: { fontSize: 8.5, color: C.muted, letterSpacing: 1 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.navy, maxWidth: 400, lineHeight: 1.25, marginBottom: 2 },
  meta: { fontSize: 9.5, color: C.muted, marginTop: 3, marginBottom: 6 },
  badge: { fontSize: 9, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 8, letterSpacing: 1 },
  h2: { fontSize: 12.5, marginTop: 16, marginBottom: 6, fontFamily: "Helvetica-Bold", color: C.navy },
  item: { marginBottom: 4 },
  note: { fontSize: 8.5, color: C.muted, marginTop: 4 },
  warning: { marginBottom: 6, padding: 6, borderLeftWidth: 2, borderLeftColor: "#b45309" },
  preview: { fontSize: 10, color: "#b45309", marginBottom: 10, fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 1, borderColor: C.line, marginTop: 4 },
  thead: { flexDirection: "row", backgroundColor: C.navy },
  th: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8.5, paddingVertical: 5, paddingHorizontal: 6 },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line },
  td: { fontSize: 9.5, paddingVertical: 5, paddingHorizontal: 6 },
  technical: { marginTop: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line },
  technicalRow: { fontSize: 7.5, color: C.muted, lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, flexDirection: "row", alignItems: "center", paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line },
  footerText: { flex: 1, fontSize: 8, color: C.muted, lineHeight: 1.35 },
  footerStrong: { fontFamily: "Helvetica-Bold", color: C.ink },
  qr: { width: 62, height: 62, marginRight: 10 },
});

export type PdfInput = {
  content: FrozenContent;
  receipts: readonly Receipt[];
  revisionId: string;
  snapshotHash: string;
  /** Referencia pública opaca para el verificador (no da acceso al PDF). */
  publicReference: string;
  /** Instante de finalización del servidor (ISO); también es la fecha de los metadatos. */
  finalizedAt: string;
  /** Enlace público del verificador para el QR; sin él, el pie lleva solo la referencia escrita. */
  verifyUrl?: string | null;
};

const formatInstant = (iso: string) => `${iso.replace("T", " ").replace(/\.\d+Z$|Z$/, "")} UTC`;

/** «16/10/2026 a las 12:05 (UTC)». En UTC a propósito: no depende del huso del servidor. */
function formatReadable(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} a las ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (UTC)`;
}

const humanField = (field: string) => {
  const text = field.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** QR como un único trazado vectorial: sin imágenes, sin red y con los mismos bytes para el mismo enlace. */
function QrCode({ url }: { url: string }) {
  const { modules } = createQr(url, { errorCorrectionLevel: "M" });
  const quiet = 2;
  let d = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  const side = modules.size + quiet * 2;
  return (
    <Svg style={styles.qr} viewBox={`0 0 ${side} ${side}`}>
      <Path d={d} fill={C.ink} />
    </Svg>
  );
}

function Header({ title, meta, color }: { title: string; meta: string; color?: keyof typeof BADGE }) {
  return (
    <View>
      <View style={styles.header}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer no admite alt */}
        <Image style={styles.logo} src={GALCOA_LOGO_PNG} />
        <Text style={styles.headerTag}>DOCUMENTO VERIFICABLE</Text>
      </View>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
        {color && <Text style={[styles.badge, BADGE[color]]}>{ALC_COLOR_LABEL[color]}</Text>}
      </View>
    </View>
  );
}

/**
 * Pie fijo de cada página. Sin número de página a propósito: con `render` (páginas dinámicas)
 * react-pdf deja de dibujar el pie fijo.
 */
function Footer({ input }: { input: PdfInput }) {
  return (
    <View style={styles.footer} fixed>
      {input.verifyUrl ? <QrCode url={input.verifyUrl} /> : null}
      <View style={styles.footerText}>
        {input.verifyUrl ? (
          <Text>
            <Text style={styles.footerStrong}>Comprobá este documento: </Text>
            {input.verifyUrl}
          </Text>
        ) : null}
        <Text>Referencia de verificación: {input.publicReference}.</Text>
        <Text>
          La huella de este archivo se registra en Hedera Testnet; eso acredita la integridad del archivo, no la veracidad de los hechos.
        </Text>
      </View>
    </View>
  );
}

const CLAIM_COLS = [
  { label: "Producto", width: "26%" },
  { label: "Dato", width: "20%" },
  { label: "Valor", width: "20%" },
  { label: "Unidad", width: "14%" },
  { label: "Estado", width: "20%" },
] as const;

const RECT_COLS = [
  { label: "Antes", width: "22%" },
  { label: "Después", width: "22%" },
  { label: "Motivo", width: "56%" },
] as const;

function TableHead({ cols }: { cols: readonly { label: string; width: string }[] }) {
  return (
    <View style={styles.thead} fixed>
      {cols.map((c) => (
        <Text key={c.label} style={[styles.th, { width: c.width }]}>
          {c.label}
        </Text>
      ))}
    </View>
  );
}

/** Semáforo ALC de la revisión (solo snapshots v2). Describe el contraste entre fuentes; no certifica los hechos. */
function AlcSection({ content }: { content: Extract<FrozenContent, { alc: unknown }> }) {
  const { alc, rectifications } = content;
  return (
    <View>
      <Text style={styles.h2}>Datos de la operación</Text>
      <View style={styles.table}>
        <TableHead cols={CLAIM_COLS} />
        {alc.claims.map((c, i) => (
          <View key={c.id} style={[styles.tr, i % 2 === 1 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
            <Text style={[styles.td, { width: CLAIM_COLS[0].width }]}>{c.subject}</Text>
            <Text style={[styles.td, { width: CLAIM_COLS[1].width }]}>{humanField(c.field)}</Text>
            <Text style={[styles.td, { width: CLAIM_COLS[2].width }]}>{c.value}</Text>
            <Text style={[styles.td, { width: CLAIM_COLS[3].width }]}>{c.unit ?? "—"}</Text>
            <Text style={[styles.td, { width: CLAIM_COLS[4].width, color: STATUS_COLOR[c.status], fontFamily: "Helvetica-Bold" }]}>
              {ALC_STATUS_SHORT[c.status]}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>
        Confirmado: coincide con un original conservado. Declarado: solo lo afirma quien cargó la operación. Reglas {alc.rulesVersion}. El
        semáforo compara lo declarado con los originales conservados; no verifica que los hechos sean ciertos.
      </Text>
      {rectifications.length > 0 && (
        <View>
          <Text style={styles.h2}>Rectificaciones</Text>
          <View style={styles.table}>
            <TableHead cols={RECT_COLS} />
            {rectifications.map((r, i) => (
              <View key={r.claimId} style={[styles.tr, i % 2 === 1 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
                <Text style={[styles.td, { width: RECT_COLS[0].width }]}>{r.previousValue}</Text>
                <Text style={[styles.td, { width: RECT_COLS[1].width }]}>{r.correctedValue}</Text>
                <Text style={[styles.td, { width: RECT_COLS[2].width }]}>{r.reason}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>Se conserva el registro original.</Text>
        </View>
      )}
    </View>
  );
}

function TechnicalData({ input }: { input: PdfInput }) {
  const rows = [
    `Referencia pública: ${input.publicReference}`,
    `Revisión: ${input.revisionId}`,
    `Huella del snapshot: ${input.snapshotHash}`,
    `Finalizado: ${formatInstant(input.finalizedAt)}`,
    ...("alc" in input.content ? [`Reglas: ${input.content.alc.rulesVersion}`] : []),
    `Generador: ${RENDERER_VERSION}`,
  ];
  return (
    <View style={styles.technical} wrap={false}>
      <Text style={[styles.technicalRow, { fontFamily: "Helvetica-Bold" }]}>Datos técnicos</Text>
      {rows.map((r) => (
        <Text key={r} style={styles.technicalRow}>
          {r}
        </Text>
      ))}
    </View>
  );
}

function FinalDocument({ input }: { input: PdfInput }) {
  const { operation, warnings } = input.content;
  const color = "alc" in input.content ? input.content.alc.color : undefined;
  const finalized = `Finalizado el ${formatReadable(input.finalizedAt)}`;
  return (
    <Document
      title={operation.title}
      author="GALCOA+"
      creator={RENDERER_VERSION}
      producer={RENDERER_VERSION}
      creationDate={new Date(input.finalizedAt)}
      modificationDate={new Date(input.finalizedAt)}
    >
      <Page size="A4" style={styles.page}>
        <Header title={operation.title} meta={finalized} color={color} />

        <Text style={styles.h2}>Operación acordada</Text>
        {operation.body.split(/\r?\n/).map((paragraph, i) => (
          <Text key={i} style={styles.item}>
            {paragraph}
          </Text>
        ))}

        {operation.corrections.length > 0 && (
          <View>
            <Text style={styles.h2}>Correcciones de forma aplicadas</Text>
            {operation.corrections.map((c, i) => (
              <Text key={i} style={styles.item}>
                • {c}
              </Text>
            ))}
          </View>
        )}

        {"alc" in input.content && <AlcSection content={input.content} />}

        {!DEMO_HIDE_WARNINGS && (
          <View>
            <Text style={styles.h2}>Advertencias informativas</Text>
            {warnings.length === 0 ? (
              <Text style={styles.item}>No se registraron advertencias para esta revisión.</Text>
            ) : (
              warnings.map((w) => (
                <View key={w.id} style={styles.warning}>
                  <Text>
                    {w.severity === "critical" ? "Contradicción material" : "Advertencia"}: {w.message}
                  </Text>
                  {w.sources.map((s) => (
                    <Text key={s.alias} style={{ fontSize: 9, color: "#555555" }}>
                      {s.alias}: {s.description}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </View>
        )}

        <Footer input={input} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Header title="Constancias de confirmación" meta={`Anexo de «${operation.title}». No modifica la operación acordada.`} />
        <Text style={[styles.item, { marginTop: 8 }]}>{receiptsHeadline(input.receipts)}</Text>
        {input.receipts.map((r) => (
          <View key={r.responseId} style={{ marginTop: 10 }} wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: C.navy }}>{("alc" in input.content ? ROLE_LABEL_V2 : ROLE_LABEL)[r.role]}</Text>
            <Text>
              {r.role === "autor"
                ? "Confirmó desde su sesión."
                : `Confirmó mediante enlace con el nombre autodeclarado «${r.declaredName}».`}
            </Text>
            <Text style={{ fontSize: 9, color: C.muted }}>Fecha del servidor: {formatReadable(r.respondedAt)}</Text>
          </View>
        ))}

        <TechnicalData input={input} />
        <Footer input={input} />
      </Page>
    </Document>
  );
}

export const PREVIEW_MARK = "Vista previa — no es la versión final";

/**
 * Vista previa del borrador vigente: efímera. Sin constancias, sin advertencias, sin hash, sello ni QR;
 * lleva la marca de vista previa en cada página. Los bytes del PDF final no dependen de este componente.
 */
function PreviewDocument({ operation }: { operation: OperationContent }) {
  return (
    <Document title={`${PREVIEW_MARK}: ${operation.title}`} author="GALCOA+" creator={RENDERER_VERSION} producer={RENDERER_VERSION}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.preview} fixed>
          {PREVIEW_MARK}
        </Text>
        <Header title={operation.title} meta="Borrador sin confirmaciones ni huella registrada." />
        <Text style={styles.h2}>Operación acordada</Text>
        {operation.body.split(/\r?\n/).map((paragraph, i) => (
          <Text key={i} style={styles.item}>
            {paragraph}
          </Text>
        ))}
        {operation.corrections.length > 0 && (
          <View>
            <Text style={styles.h2}>Correcciones de forma aplicadas</Text>
            {operation.corrections.map((c, i) => (
              <Text key={i} style={styles.item}>
                • {c}
              </Text>
            ))}
          </View>
        )}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{PREVIEW_MARK}. Borrador sin confirmaciones ni huella registrada.</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Bytes de la vista previa; no se persiste ni se hashea. */
export async function renderPreviewPdf(operation: OperationContent): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<PreviewDocument operation={OperationContentSchema.parse(operation)} />));
}

/** Bytes del PDF final con su hash y longitud, listos para staging. */
export async function renderFinalPdf(input: PdfInput): Promise<{ bytes: Uint8Array; sha256: string; byteLength: number; renderer: string }> {
  const content = FrozenContentSchema.parse(input.content);
  if (input.receipts.length < 1 || input.receipts.length !== content.selection.length) {
    throw new Error("Las constancias no corresponden a la selección congelada");
  }
  const buffer = await renderToBuffer(<FinalDocument input={{ ...input, content }} />);
  const bytes = new Uint8Array(buffer);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength, renderer: RENDERER_VERSION };
}
