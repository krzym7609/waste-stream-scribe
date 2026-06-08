
ALTER TABLE public.equipment_attachments
  ADD COLUMN event_id UUID REFERENCES public.equipment_events(id) ON DELETE CASCADE;
CREATE INDEX equipment_attachments_event_idx ON public.equipment_attachments(event_id);
