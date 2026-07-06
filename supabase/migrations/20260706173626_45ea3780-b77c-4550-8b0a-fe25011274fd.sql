
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS imagem_path text;

-- Storage policies: authenticated users can upload/read/delete their own files under {uid}/...
CREATE POLICY "Feedback own upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'feedback-imagens'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Feedback own read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-imagens'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_dono(auth.uid())
  )
);

CREATE POLICY "Feedback own delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-imagens'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
