
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS resposta text,
  ADD COLUMN IF NOT EXISTS respondido_em timestamptz,
  ADD COLUMN IF NOT EXISTS respondido_por uuid,
  ADD COLUMN IF NOT EXISTS resolvido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz;

-- Permitir que o dono (admin) leia e atualize qualquer feedback
DROP POLICY IF EXISTS "Dono le todos os feedbacks" ON public.feedbacks;
CREATE POLICY "Dono le todos os feedbacks"
ON public.feedbacks FOR SELECT
TO authenticated
USING (public.is_dono(auth.uid()));

DROP POLICY IF EXISTS "Dono atualiza feedbacks" ON public.feedbacks;
CREATE POLICY "Dono atualiza feedbacks"
ON public.feedbacks FOR UPDATE
TO authenticated
USING (public.is_dono(auth.uid()))
WITH CHECK (public.is_dono(auth.uid()));
