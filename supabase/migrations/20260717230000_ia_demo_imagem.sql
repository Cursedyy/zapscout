-- Envio automático de imagem de demo (fixa) pela IA quando o lead demonstra
-- interesse claro em ver a demonstração funcionando.

-- Bucket público pra hospedar assets fixos (só a imagem de demo por
-- enquanto) — sem dado sensível, só print de exemplo. Público de propósito:
-- a UazAPI precisa buscar a URL pra enviar via /send/media.
insert into storage.buckets (id, name, public)
values ('demo-assets', 'demo-assets', true)
on conflict (id) do update set public = true;

-- Leitura pública explícita (redundante com bucket public=true pro endpoint
-- /object/public/, mas documenta a intenção e cobre outros caminhos de leitura).
drop policy if exists "Leitura pública de demo-assets" on storage.objects;
create policy "Leitura pública de demo-assets"
on storage.objects for select
to public
using (bucket_id = 'demo-assets');

-- Sem policy de insert/update/delete: só o service_role (backend) pode
-- escrever nesse bucket — usuários não fazem upload aqui.

-- Marca se/quando a demo já foi enviada nessa conversa — evita a IA mandar
-- a mesma imagem de novo a cada mensagem se o modelo "esquecer" que já
-- enviou (trava em código, não só no prompt).
ALTER TABLE ia_conversas
  ADD COLUMN IF NOT EXISTS demo_enviada_em timestamptz;

COMMENT ON COLUMN ia_conversas.demo_enviada_em IS 'Quando a imagem de demo foi enviada nessa conversa (null = ainda não enviou). Evita reenvio mesmo se a IA marcar enviarDemo:true de novo.';
