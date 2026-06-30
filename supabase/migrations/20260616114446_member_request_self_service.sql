-- RPCs para auto-gerenciamento de pedidos de entrada pelo próprio usuário.
-- Todas com SECURITY DEFINER + search_path explícito (padrão do projeto).

-- Retorna o pedido pendente do usuário atual com nome da org, ou vazio se não houver.
CREATE OR REPLACE FUNCTION public.get_my_pending_request()
RETURNS TABLE(org_name TEXT, org_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT o.name::TEXT, o.id
  FROM public.member_requests mr
  JOIN public.organizations o ON o.id = mr.organization_id
  WHERE mr.user_id = auth.uid();
END;
$$;

-- Cancela o pedido pendente do usuário atual (sem excluir a conta auth).
CREATE OR REPLACE FUNCTION public.cancel_my_member_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.member_requests WHERE user_id = auth.uid();
END;
$$;

-- Cria um novo pedido de entrada para o usuário atual em uma org pelo código.
-- Replica a lógica do trigger handle_new_user para suportar re-apply após cancelamento.
CREATE OR REPLACE FUNCTION public.apply_to_org(p_org_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id   UUID;
  v_full_name TEXT;
BEGIN
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE code = p_org_code;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Código de organização inválido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_requests WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Já existe um pedido pendente para este usuário';
  END IF;

  SELECT raw_user_meta_data->>'full_name' INTO v_full_name
  FROM auth.users
  WHERE id = auth.uid();

  INSERT INTO public.member_requests (user_id, organization_id, full_name)
  VALUES (auth.uid(), v_org_id, COALESCE(v_full_name, ''));

  INSERT INTO public.notifications (user_id, type, title, body, reference_id, reference_type)
  SELECT
    p.id,
    'member_request',
    'Novo pedido de entrada',
    COALESCE(v_full_name, '') || ' quer entrar na organização',
    auth.uid(),
    'member_request'
  FROM public.profiles p
  WHERE p.organization_id = v_org_id
    AND p.role IN ('tenant_admin', 'master');
END;
$$;;
