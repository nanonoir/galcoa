import { afterEach, beforeEach, expect, it, vi } from "vitest";
const doubles=vi.hoisted(()=>({ getUser:vi.fn(),upload:vi.fn(),from:vi.fn(),create:vi.fn() }));
vi.mock("@supabase/ssr",()=>({createBrowserClient:doubles.create}));
import { uploadReservedEvidence } from "@/features/auth/containers/supabase-browser";

const permit={transport:"authenticated",bucket:"evidences-private",objectPath:"11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",contentType:"application/pdf",maxBytes:3,expiresAt:"2026-10-16T15:02:00.000Z"};
const file=()=>new File(["pdf"],"private-name.pdf",{type:"application/pdf"});
beforeEach(()=>{
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","public-test-key");
  doubles.upload.mockReset().mockResolvedValue({error:null});
  doubles.getUser.mockReset().mockResolvedValue({data:{user:{id:"verified"}},error:null});
  doubles.from.mockReset().mockReturnValue({upload:doubles.upload});
  doubles.create.mockReset().mockReturnValue({auth:{getUser:doubles.getUser},storage:{from:doubles.from}});
});
afterEach(()=>vi.unstubAllEnvs());
it("usa la sesión existente y upload estándar sin upsert, nombre privado ni emisión de tokens",async()=>{
  await uploadReservedEvidence(permit,file());
  expect(doubles.getUser).toHaveBeenCalledOnce();
  expect(doubles.create).toHaveBeenCalledWith("http://127.0.0.1:54321","public-test-key");
  expect(doubles.from).toHaveBeenCalledWith("evidences-private");
  expect(doubles.upload).toHaveBeenCalledWith(permit.objectPath,expect.any(File),{upsert:false,contentType:"application/pdf"});
});
it("rechaza permiso alterado, ruta arbitraria, campos extra y archivo incompatible antes de red",async()=>{
  for(const value of [{...permit,bucket:"versions-private"},{...permit,objectPath:"../../other"},{...permit,token:"forged"},{...permit,maxBytes:4}]) {
    await expect(uploadReservedEvidence(value,file())).rejects.toThrow();
  }
  expect(doubles.create).not.toHaveBeenCalled();
});
it("no sube sin Auth ni oculta un fallo de Storage",async()=>{
  doubles.getUser.mockResolvedValueOnce({data:{user:null},error:null});
  await expect(uploadReservedEvidence(permit,file())).rejects.toThrow("Sesión no disponible");
  expect(doubles.upload).not.toHaveBeenCalled();
  doubles.upload.mockResolvedValueOnce({error:{message:"private backend detail"}});
  await expect(uploadReservedEvidence(permit,file())).rejects.toThrow("No se pudo cargar el archivo");
});
