// Lazy-loaded pdfmake instance with built-in Roboto font (supports Polish characters)
import type { TDocumentDefinitions } from "pdfmake/interfaces";

let cached: typeof import("pdfmake/build/pdfmake") | null = null;

async function getPdfMake() {
  if (cached) return cached;
  const pdfMakeMod = (await import("pdfmake/build/pdfmake")) as unknown as {
    default: typeof import("pdfmake/build/pdfmake") & {
      vfs?: Record<string, string>;
    };
  };
  const vfsMod = (await import("pdfmake/build/vfs_fonts")) as unknown as {
    default?: { vfs?: Record<string, string> } | Record<string, string>;
    pdfMake?: { vfs: Record<string, string> };
    vfs?: Record<string, string>;
  };
  const pdfMake = pdfMakeMod.default;
  // pdfmake's vfs_fonts shape changes between versions
  const vfs =
    (vfsMod.pdfMake && vfsMod.pdfMake.vfs) ||
    (vfsMod.default as { vfs?: Record<string, string> })?.vfs ||
    (vfsMod.default as Record<string, string> | undefined) ||
    vfsMod.vfs;
  if (vfs) pdfMake.vfs = vfs as Record<string, string>;
  cached = pdfMake as typeof import("pdfmake/build/pdfmake");
  return cached;
}

export async function downloadPdf(docDefinition: TDocumentDefinitions, filename: string) {
  const pdfMake = await getPdfMake();
  pdfMake.createPdf(docDefinition).download(filename);
}
