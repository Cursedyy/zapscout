
-- Adiciona políticas RLS para o "dono" gerenciar todos os profiles
-- O plano "dono" identifica o super-admin

-- Função security definer para checar se o usuário atual é dono
CREATE OR REPLACE FUNCTION public.is_dono(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND plano = 'dono'
  )
$$;

-- Permite dono ver e atualizar TODOS os profiles
CREATE POLICY "dono can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_dono(auth.uid()));

CREATE POLICY "dono can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_dono(auth.uid()));

-- Atualiza trigger de novo usuário para auto-atribuir plano dono ao email do owner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_plano text := 'free';
BEGIN
  IF NEW.email = 'matheuscrodrigues99@gmail.com' THEN
    v_plano := 'dono';
  END IF;

  INSERT INTO public.profiles (id, nome, email, plano)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email, v_plano);

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

-- Atualiza o profile do dono se já existir
UPDATE public.profiles SET plano = 'dono'
WHERE email = 'matheuscrodrigues99@gmail.com';
