import { createFileRoute } from "@tanstack/react-router";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Webhook da Kiwify — chamado quando uma compra é aprovada.
 *
 * Configure na Kiwify:
 *   URL: https://map-prospect-ai.lovable.app/api/public/kiwify-webhook
 *   (ou o domínio publicado / preview)
 *   Token: valor do secret KIWIFY_WEBHOOK_SECRET
 *
 * A Kiwify envia o token como query param `?signature=<hmac-sha1>` do body cru.
 *
 * Fluxo:
 *  1. Verifica HMAC-SHA1
 *  2. Cria usuário em auth.users via admin API (senha aleatória)
 *  3. O trigger handle_new_user cria o profile automaticamente
 *  4. Atualiza profile com plano, token_acesso, kiwify_order_id, senha_definida=false
 *  5. Cliente recebe email com link /cadastro?token=<token_acesso>
 */
export const Route = createFileRoute("/api/public/kiwify-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const signature = url.searchParams.get("signature");
        const body = await request.text();
        const secret = process.env.KIWIFY_WEBHOOK_SECRET;

        const { logSecurityEvent, extractReqMeta } = await import("@/lib/security-log.server");
        const meta = extractReqMeta(request);

        if (!secret) {
          return new Response("Webhook secret não configurado", { status: 500 });
        }
        if (!signature) {
          void logSecurityEvent({
            event_type: "webhook_rejected",
            ip: meta.ip,
            user_agent: meta.user_agent,
            identifier: "kiwify",
            reason: "missing_signature",
          });
          return new Response("Assinatura ausente", { status: 401 });
        }

        const expected = createHmac("sha1", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expected, "hex");
        if (
          sigBuf.length !== expBuf.length ||
          !timingSafeEqual(sigBuf, expBuf)
        ) {
          void logSecurityEvent({
            event_type: "webhook_rejected",
            ip: meta.ip,
            user_agent: meta.user_agent,
            identifier: "kiwify",
            reason: "invalid_signature",
            details: { sig_len: sigBuf.length, exp_len: expBuf.length },
          });
          return new Response("Assinatura inválida", { status: 401 });
        }


        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        // Só processa compras aprovadas
        const status = String(payload?.order_status ?? payload?.status ?? "").toLowerCase();
        const isApproved =
          status === "paid" || status === "approved" || payload?.webhook_event_type === "order_approved";
        if (!isApproved) {
          return Response.json({ ok: true, ignored: true, status });
        }

        const orderId: string = payload?.order_id ?? payload?.order_ref ?? payload?.id ?? "";
        const email: string = (payload?.Customer?.email ?? payload?.customer?.email ?? "").toLowerCase().trim();
        const nome: string = payload?.Customer?.full_name ?? payload?.customer?.full_name ?? payload?.Customer?.name ?? "";
        const productName: string = String(payload?.Product?.product_name ?? payload?.product?.name ?? "").toLowerCase();

        if (!email || !orderId) {
          return new Response("Dados da compra incompletos", { status: 400 });
        }

        // Idempotência: se já processamos este pedido, retorna ok
        const { data: existingByOrder } = await supabaseAdmin
          .from("profiles")
          .select("id, token_acesso")
          .eq("kiwify_order_id", orderId)
          .maybeSingle();
        if (existingByOrder) {
          return Response.json({ ok: true, duplicated: true });
        }

        // Mapeia produto → plano
        const plano = productName.includes("business")
          ? "business"
          : productName.includes("agência") || productName.includes("agencia")
          ? "agencia"
          : "pro";

        const tokenAcesso = randomUUID();

        // Existe usuário com este email?
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        let userId: string;
        let createdNewUser = false;
        if (existingProfile?.id) {
          userId = existingProfile.id;
        } else {
          // Cria usuário com senha aleatória (será trocada via /cadastro?token=)
          const tempPassword = randomBytes(24).toString("base64url");
          const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { nome },
          });
          if (cErr || !created?.user) {
            return new Response(`Erro ao criar usuário: ${cErr?.message ?? "unknown"}`, { status: 500 });
          }
          userId = created.user.id;
          createdNewUser = true;
        }

        // Atualiza profile (o trigger handle_new_user já criou o registro básico)
        const { error: upErr } = await supabaseAdmin
          .from("profiles")
          .update({
            plano,
            token_acesso: createdNewUser ? tokenAcesso : null,
            kiwify_order_id: orderId,
            ...(createdNewUser ? { senha_definida: false } : {}),
            nome: nome || undefined,
          })
          .eq("id", userId)
          .neq("plano", "dono");
        if (upErr) {
          return new Response(`Erro ao atualizar profile: ${upErr.message}`, { status: 500 });
        }

        await supabaseAdmin.from("funnel_events").insert({
          user_id: userId,
          event_name: "purchase_approved",
          plan_id: plano,
          source: "payment",
        });

        // TODO: integrar envio de email transacional com o link /cadastro?token=<tokenAcesso>
        // Por enquanto retornamos o link na resposta para você capturar via Kiwify ou n8n.
        const linkAcesso = createdNewUser ? `${url.origin}/cadastro?token=${tokenAcesso}` : `${url.origin}/login`;

        if (createdNewUser) {
          await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${url.origin}/reset-password`,
          });
        }

        return Response.json({ ok: true, plano, link_acesso: linkAcesso, existing_account: !createdNewUser });
      },
    },
  },
});
