import "server-only";

import { createHash } from "node:crypto";

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import { OperationContentSchema, type OperationContent } from "@/lib/contracts/core";
import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
import { FrozenContentSchema, type FrozenContent } from "@/lib/contracts/review";
import type { Receipt } from "@/lib/contracts/version";

import { receiptsHeadline } from "../finalization/receipts";

/**
 * PDF final (MVP-081). Se renderiza en el servidor desde el **snapshot
 * persistido** (nunca desde el borrador, la IA ni el navegador): primero la
 * operación acordada tal cual, después el anexo «Constancias de
 * confirmación». Metadatos fijos (fecha = finalización, productor estable)
 * para no meter el reloj en los bytes. Lenguaje de declaración por enlace,
 * sin términos de certificación ni de identidad comprobada.
 */

export const RENDERER_VERSION = "galcoa-pdf-v1";

const ROLE_LABEL = { autor: "Autor", intermediario: "Intermediario", comprador: "Comprador" } as const;
/** Snapshots v2: los roles internos se muestran como proveedor / transportista / comprador. */
const ROLE_LABEL_V2 = { autor: "Proveedor", intermediario: "Transportista", comprador: "Comprador" } as const;

const ALC_COLOR_LABEL = { verde: "VERDE", amarillo: "AMARILLO", rojo: "ROJO" } as const;
const ALC_STATUS_LABEL = {
  declarado: "declarado (sin original conservado que lo respalde)",
  confirmado: "coincide con un original conservado",
  contradicho: "contradicho por una fuente",
  ambiguo: "ambiguo",
} as const;

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.4 },
  title: { fontSize: 18, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 9, color: "#555555", marginBottom: 14 },
  h2: { fontSize: 13, marginTop: 14, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  item: { marginBottom: 4 },
  warning: { marginBottom: 6, padding: 6, borderLeftWidth: 2, borderLeftColor: "#b45309" },
  preview: { fontSize: 10, color: "#b45309", marginBottom: 10, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#777777" },
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
};

const formatInstant = (iso: string) => `${iso.replace("T", " ").replace(/\.\d+Z$|Z$/, "")} UTC`;

/** Semáforo ALC de la revisión (solo snapshots v2). Describe el contraste entre fuentes; no certifica los hechos. */
function AlcSection({ content }: { content: Extract<FrozenContent, { alc: unknown }> }) {
  const { alc, rectifications } = content;
  return (
    <View>
      <Text style={styles.h2}>Contraste de fuentes: semáforo {ALC_COLOR_LABEL[alc.color]}</Text>
      <Text style={styles.item}>Reglas {alc.rulesVersion}. El semáforo compara lo declarado con los originales conservados; no verifica que los hechos sean ciertos.</Text>
      {alc.claims.map((c) => (
        <Text key={c.id} style={styles.item}>
           {c.subject} / {c.field}: {c.value}
          {c.unit ? ` ${c.unit}` : ""} - {ALC_STATUS_LABEL[c.status]}
        </Text>
      ))}
      {rectifications.length > 0 && (
        <View>
          <Text style={styles.h2}>Rectificaciones</Text>
          {rectifications.map((r) => (
            <Text key={r.claimId} style={styles.item}>
               {r.previousValue} {"->"} {r.correctedValue}. Motivo: {r.reason}. Se conserva el registro original.
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function FinalDocument({ input }: { input: PdfInput }) {
  const { operation, warnings } = input.content;
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
        <Text style={styles.title}>{operation.title}</Text>
        <Text style={styles.meta}>
          Revisión {input.revisionId} · Snapshot {input.snapshotHash.slice(0, 16)}… · Finalizado {formatInstant(input.finalizedAt)}
        </Text>

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

        <Text style={styles.footer} fixed>
          Referencia de verificación: {input.publicReference}. La huella de este archivo se registra en Hedera Testnet; eso
          acredita la integridad del archivo, no la veracidad de los hechos.
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Constancias de confirmación</Text>
        <Text style={styles.meta}>Anexo de la revisión {input.revisionId}. No modifica la operación acordada.</Text>
        <Text style={styles.item}>{receiptsHeadline(input.receipts)}</Text>
        {input.receipts.map((r) => (
          <View key={r.responseId} style={{ marginTop: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{("alc" in input.content ? ROLE_LABEL_V2 : ROLE_LABEL)[r.role]}</Text>
            <Text>
              {r.role === "autor"
                ? "Confirmó desde su sesión."
                : `Confirmó mediante enlace con el nombre autodeclarado «${r.declaredName}».`}
            </Text>
            <Text style={{ fontSize: 9, color: "#555555" }}>Fecha del servidor: {formatInstant(r.respondedAt)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export const PREVIEW_MARK = "Vista previa — no es la versión final";

/**
 * Vista previa del borrador vigente: efímera. Sin constancias, sin advertencias, sin hash ni sello;
 * lleva la marca de vista previa en cada página. Los bytes del PDF final no dependen de este componente.
 */
function PreviewDocument({ operation }: { operation: OperationContent }) {
  return (
    <Document title={`${PREVIEW_MARK}: ${operation.title}`} author="GALCOA+" creator={RENDERER_VERSION} producer={RENDERER_VERSION}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.preview} fixed>
          {PREVIEW_MARK}
        </Text>
        <Text style={styles.title}>{operation.title}</Text>
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
        <Text style={styles.footer} fixed>
          {PREVIEW_MARK}. Borrador sin confirmaciones ni huella registrada.
        </Text>
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
