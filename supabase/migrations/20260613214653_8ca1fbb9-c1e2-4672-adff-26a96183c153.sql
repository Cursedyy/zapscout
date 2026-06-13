DROP POLICY IF EXISTS "Users can create own feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Users can read own feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Users can manage own feedbacks" ON public.feedbacks;
CREATE POLICY "Users can manage own feedbacks"
ON public.feedbacks
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);