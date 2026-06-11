
CREATE POLICY "dono sees all feedbacks"
  ON public.feedbacks
  FOR SELECT
  TO authenticated
  USING (public.is_dono(auth.uid()));
