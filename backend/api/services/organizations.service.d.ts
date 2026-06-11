export type AdminOrgMember = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: "master" | "tenant_admin" | "tenant_user";
  created_at: string;
};

export type PendingMember = {
  id: string;
  user_id: string;
  full_name: string;
  created_at: string;
};

export type CreateOrganizationData = {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  orgName: string;
  orgPassword: string;
};

export type CreateOrganizationResult = {
  orgCode: string | null;
  error: string | null;
};

export function getOrgByCode(code: string): Promise<{ name: string } | null>;

export function getMyOrganization(
  orgId: string,
): Promise<{ id: string; name: string; code: string } | null>;

export function getOrgMembers(orgId: string): Promise<AdminOrgMember[]>;

export function getPendingMembers(orgId: string): Promise<PendingMember[]>;

export function acceptMember(
  requestId: string,
  role: "tenant_user" | "tenant_admin",
): Promise<void>;

export function rejectMember(userId: string): Promise<void>;

export function promoteToAdmin(memberId: string): Promise<void>;

export function removeMember(memberId: string): Promise<void>;

export function createOrganization(
  data: CreateOrganizationData,
): Promise<CreateOrganizationResult>;
