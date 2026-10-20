import "server-only";

import { verifySession } from "@/lib/supabase/auth";
import { getSessionClient } from "@/lib/supabase/session";

import type { PdfDownloadDeps } from "./pdf-download";

export const pdfDownloadDeps: PdfDownloadDeps = {
  async getContext() {
    const client = await getSessionClient();
    return { session: await verifySession(client), client };
  },
};
