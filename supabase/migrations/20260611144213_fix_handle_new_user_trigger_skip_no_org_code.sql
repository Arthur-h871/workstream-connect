CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Se não há organization_code no metadata, é criação via Edge Function (admin de org)
  -- Nesse caso o Edge Function cuida de criar o profile — skip silencioso
  IF (NEW.raw_user_meta_data->>'organization_code') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO org_id
  FROM organizations
  WHERE code = (NEW.raw_user_meta_data->>'organization_code');

  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Código de organização inválido';
  END IF;

  INSERT INTO member_requests (user_id, organization_id, full_name)
  VALUES (
    NEW.id,
    org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
  SELECT
    p.id,
    'member_request',
    'Novo pedido de entrada',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || ' quer entrar na organização',
    NEW.id,
    'member_request'
  FROM profiles p
  WHERE p.organization_id = org_id
    AND p.role IN ('tenant_admin', 'master');

  RETURN NEW;
END;
$$;;
