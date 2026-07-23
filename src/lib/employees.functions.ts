import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]/g, "");
}

async function assertManager(ctx: { supabase: any; userId: string }) {
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

const createInput = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.enum(["operator", "kierownik", "admin", "zarzadca"]).default("operator"),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertManager(context as any);
    const isBoss = roles.includes("admin") || roles.includes("zarzadca");
    // tylko admin/zarządca może tworzyć kierownika/admina/zarządcę
    if ((data.role === "admin" || data.role === "kierownik" || data.role === "zarzadca") && !isBoss) {
      throw new Error("Tylko administrator lub zarządca może nadawać rolę kierownika/zarządcy/admina");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // wygeneruj unikalny login
    const base = (slugify(data.first_name).charAt(0) || "x") + slugify(data.last_name);
    let username = base;
    let suffix = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (!existing) break;
      suffix += 1;
      username = `${base}${suffix}`;
    }

    const password = generatePassword();
    const email = `${username}@oczyszczalnia.local`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone ?? null,
        username,
        role: data.role,
        must_change_password: true,
      },
    });
    if (error) throw new Error(error.message);

    return {
      user_id: created.user?.id,
      username,
      password,
      full_name: `${data.first_name} ${data.last_name}`,
    };
  });

const resetInput = z.object({ user_id: z.string().uuid() });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = generatePassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user_id);
    return { password };
  });
