
-- Tabela de sequências (templates de cadência)
CREATE TABLE public.sequencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  objetivo text NOT NULL DEFAULT 'outro',
  ativa boolean NOT NULL DEFAULT true,
  parar_ao_responder boolean NOT NULL DEFAULT true,
  parar_ao_fechar boolean NOT NULL DEFAULT true,
  parar_ao_mover_crm boolean NOT NULL DEFAULT false,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sequencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sequencias all" ON public.sequencias
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tg_sequencias_updated_at
  BEFORE UPDATE ON public.sequencias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tabela de execuções (cada lead atribuído a uma sequência)
CREATE TABLE public.sequencia_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sequencia_id uuid NOT NULL REFERENCES public.sequencias(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  etapa_atual integer NOT NULL DEFAULT 0,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  pausada boolean NOT NULL DEFAULT false,
  cancelada boolean NOT NULL DEFAULT false,
  parada_por_resposta boolean NOT NULL DEFAULT false,
  concluida boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sequencia_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own execucoes all" ON public.sequencia_execucoes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_execucoes_user_ativa ON public.sequencia_execucoes(user_id)
  WHERE pausada = false AND cancelada = false AND concluida = false;

CREATE TRIGGER tg_execucoes_updated_at
  BEFORE UPDATE ON public.sequencia_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed: 3 sequências padrão para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email);

  INSERT INTO public.sequencias (user_id, nome, objetivo, etapas) VALUES
  (NEW.id, 'Clássica 3 etapas', 'reuniao', '[
    {"ordem":1,"intervalo":0,"unidade":"horas","mensagem":"Olá! Vi a {{nome}} no Google Maps e percebi uma oportunidade de melhorar a presença digital de vocês. Posso explicar em 5 minutos?"},
    {"ordem":2,"intervalo":3,"unidade":"dias","mensagem":"Oi {{nome}}, tudo bem? Só reforçando meu contato anterior. Ajudo negócios em {{cidade}} a atrair mais clientes online. Tem interesse?"},
    {"ordem":3,"intervalo":7,"unidade":"dias","mensagem":"{{nome}}, última mensagem da minha parte. Se quiser conversar sobre sua presença digital no futuro, é só responder. Até mais! 👋"}
  ]'::jsonb),
  (NEW.id, 'Agressiva 5 etapas', 'vender_site', '[
    {"ordem":1,"intervalo":0,"unidade":"horas","mensagem":"Olá {{nome}}! Vi que vocês ainda não têm um site. Posso ajudar com isso rapidamente."},
    {"ordem":2,"intervalo":1,"unidade":"dias","mensagem":"Oi {{nome}}! Você viu minha mensagem de ontem? Gostaria muito de apresentar uma solução para vocês."},
    {"ordem":3,"intervalo":3,"unidade":"dias","mensagem":"{{nome}}, separei algumas referências de sites que criei para negócios como o de vocês. Posso enviar?"},
    {"ordem":4,"intervalo":5,"unidade":"dias","mensagem":"Oi {{nome}}! Tenho uma proposta especial para novos clientes esta semana. Vale a conversa!"},
    {"ordem":5,"intervalo":7,"unidade":"dias","mensagem":"{{nome}}, última tentativa. Se houver interesse futuro, estarei à disposição. 😊"}
  ]'::jsonb),
  (NEW.id, 'Pós-reunião', 'reuniao', '[
    {"ordem":1,"intervalo":2,"unidade":"horas","mensagem":"Oi {{nome}}! Foi ótimo conversar. Segue o resumo do que falamos: [adicione o resumo]. Qualquer dúvida, é só chamar!"},
    {"ordem":2,"intervalo":2,"unidade":"dias","mensagem":"{{nome}}, passando para saber se teve a chance de analisar a proposta. Posso tirar alguma dúvida?"},
    {"ordem":3,"intervalo":5,"unidade":"dias","mensagem":"Oi {{nome}}! Só confirmando interesse. Se precisar de mais informações para decidir, estou disponível."},
    {"ordem":4,"intervalo":10,"unidade":"dias","mensagem":"{{nome}}, última mensagem sobre nossa conversa. Quando estiver pronto para avançar, pode me chamar!"}
  ]'::jsonb);

  RETURN NEW;
END; $function$;
