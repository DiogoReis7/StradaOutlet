
ALTER TABLE public.sales_entries REPLICA IDENTITY FULL;
ALTER TABLE public.sgf_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.shift_days REPLICA IDENTITY FULL;
ALTER TABLE public.employees REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.weight_overrides REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sales_entries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_entries;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sgf_tickets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sgf_tickets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shift_days') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_days;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='employees') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='weight_overrides') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.weight_overrides;
  END IF;
END $$;
