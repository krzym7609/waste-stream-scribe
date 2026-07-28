import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertEmployeeManager, generateEmployeePassword, slugifyEmployeeName } from "./employees.server";

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
    const roles = await assertEmployeeManager(context as any);
    const isBoss = roles.includes("admin") || roles.includes("zarzadca");
    // tylko admin/zarządca może tworzyć kierownika/admina/zarządcę
    if ((data.role === "admin" || data.role === "kierownik" || data.role === "zarzadca") && !isBoss) {
      throw new Error("Tylko administrator lub zarządca może nadawać rolę kierownika/zarządcy/admina");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // wygeneruj unikalny login
    const base = (slugifyEmployeeName(data.first_name).charAt(0) || "x") + slugifyEmployeeName(data.last_name);
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

    const password = generateEmployeePassword();
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
    await assertEmployeeManager(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = generateEmployeePassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user_id);
    return { password };
  });

const updateInput = z.object({
  user_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.enum(["operator", "kierownik", "admin", "zarzadca"]).optional(),
});

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertEmployeeManager(context as any);
    const isBoss = roles.includes("admin") || roles.includes("zarzadca");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // pobierz obecną rolę edytowanego użytkownika
    const { data: currentRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id)
      .maybeSingle();
    const currentRole = currentRoleRow?.role as string | undefined;

    // kierownik nie może edytować kierownika/admina/zarządcy ani nadawać takich ról
    if (!isBoss) {
      if (currentRole && currentRole !== "operator") {
        throw new Error("Tylko administrator lub zarządca może edytować kierownika/zarządcę/admina");
      }
      if (data.role && data.role !== "operator") {
        throw new Error("Tylko administrator lub zarządca może nadawać rolę kierownika/zarządcy/admina");
      }
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone ?? null,
      })
      .eq("id", data.user_id);
    if (profErr) throw new Error(profErr.message);

    // zaktualizuj też user_metadata w auth
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      user_metadata: {
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone ?? null,
      },
    });

    if (data.role && data.role !== currentRole) {
      // usuń stare role i dodaj nową
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (roleErr) throw new Error(roleErr.message);
    }

    return { ok: true };
  });

const deleteInput = z.object({ user_id: z.string().uuid() });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertEmployeeManager(context as any);
    const isBoss = roles.includes("admin") || roles.includes("zarzadca");

    if (data.user_id === (context as any).userId) {
      throw new Error("Nie możesz usunąć własnego konta");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: targetRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id)
      .maybeSingle();
    const targetRole = targetRoleRow?.role as string | undefined;

    if (!isBoss && targetRole && targetRole !== "operator") {
      throw new Error("Tylko administrator lub zarządca może usuwać kierownika/zarządcę/admina");
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        employment_status: "inactive",
        deactivated_at: new Date().toISOString(),
        deactivated_by: (context as any).userId,
      })
      .eq("id", data.user_id);
    if (profErr) throw new Error(profErr.message);

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "876000h",
    });
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });

