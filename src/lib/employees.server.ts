export function generateEmployeePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}

export function slugifyEmployeeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]/g, "");
}

export async function assertEmployeeManager(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("kierownik") && !roles.includes("admin") && !roles.includes("zarzadca")) {
    throw new Error("Brak uprawnień — wymagana rola kierownik, zarządca lub admin");
  }
  return roles;
}