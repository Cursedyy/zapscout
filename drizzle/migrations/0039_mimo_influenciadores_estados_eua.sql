-- Preserve Brazilian codes and distinguish US states with the US- prefix.
ALTER TABLE public.mimo_influenciadores
 DROP CONSTRAINT mimo_influenciadores_uf_check;
ALTER TABLE public.mimo_influenciadores
 ADD CONSTRAINT mimo_influenciadores_uf_check CHECK (uf IN (
 'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO','US-AL','US-AK','US-AZ','US-AR','US-CA','US-CO','US-CT','US-DE','US-FL','US-GA','US-HI','US-ID','US-IL','US-IN','US-IA','US-KS','US-KY','US-LA','US-ME','US-MD','US-MA','US-MI','US-MN','US-MS','US-MO','US-MT','US-NE','US-NV','US-NH','US-NJ','US-NM','US-NY','US-NC','US-ND','US-OH','US-OK','US-OR','US-PA','US-RI','US-SC','US-SD','US-TN','US-TX','US-UT','US-VT','US-VA','US-WA','US-WV','US-WI','US-WY','US-DC'
 ));
