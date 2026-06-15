import { createFileRoute } from "@tanstack/react-router";
import { Camera, Flame } from "lucide-react";
import { useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import {
  getProfileStats,
  uploadAvatar,
  updateProfile,
  type Profile,
} from "backend/api/services/users.service";
import {
  getCurrentUserEmail,
  signIn,
  updatePassword,
} from "backend/api/services/auth.service";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — Marco" },
      { name: "description", content: "Sua conta e preferências." },
    ],
  }),
  loader: async ({ context }) => {
    const userId = context.profile.id;
    const [stats, email] = await Promise.all([
      getProfileStats(userId),
      getCurrentUserEmail(),
    ]);
    return {
      profile: context.profile as Profile,
      stats,
      email,
    };
  },
  component: () => (
    <AppShell>
      <Perfil />
    </AppShell>
  ),
});

function Perfil() {
  const { profile, stats, email } = Route.useLoaderData();
  const initials = getInitials(profile.full_name);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="section-label">Horas este mês</p>
            <p className="mt-2 text-3xl font-semibold text-copper">
              {formatHours(stats.horasNoMes)}
            </p>
          </div>
          <div>
            <p className="section-label">Sequência</p>
            <p className="mt-2 flex items-center gap-2 text-3xl font-semibold">
              <Flame className="h-6 w-6 text-copper" />
              <span>{stats.streak}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        <AvatarSection
          userId={profile.id}
          initialAvatarUrl={profile.avatar_url ?? null}
          initials={initials}
        />
        <PersonalInfoSection
          userId={profile.id}
          initialName={profile.full_name}
          email={email}
        />
        <PasswordSection email={email} />
      </div>
    </div>
  );
}

function AvatarSection({
  userId,
  initialAvatarUrl,
  initials,
}: {
  userId: string;
  initialAvatarUrl: string | null;
  initials: string;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadAvatar(userId, file);
    if (url) setAvatarUrl(url);
    setUploading(false);
    e.target.value = "";
  }

  return (
    <section className="p-6">
      <p className="section-label mb-4">Foto de perfil</p>
      <div className="flex items-center gap-4">
        <div className="group relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Foto de perfil"
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-copper-soft text-2xl font-semibold text-copper">
              {initials}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-wait"
            aria-label="Trocar foto de perfil"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {uploading ? "Enviando..." : "Clique na foto para enviar uma nova imagem."}
        </p>
      </div>
    </section>
  );
}

function PersonalInfoSection({
  userId,
  initialName,
  email,
}: {
  userId: string;
  initialName: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await updateProfile(userId, { full_name: trimmed });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const unchanged = name.trim() === initialName;

  return (
    <section className="p-6">
      <p className="section-label mb-4">Informações pessoais</p>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Nome
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            E-mail
          </span>
          <input
            type="email"
            value={email}
            disabled
            className="w-full cursor-not-allowed rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
        </label>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || unchanged}
        className="mt-4 rounded-md bg-copper px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}
      </button>
    </section>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError("");
    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email, currentPassword);
    if (signInError) {
      setError("Senha atual incorreta");
      setLoading(false);
      return;
    }
    const { error: updateError } = await updatePassword(newPassword);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 3000);
    }
    setLoading(false);
  }

  const canSubmit =
    Boolean(currentPassword && newPassword && confirmPassword) && !loading;

  return (
    <section className="p-6">
      <p className="section-label mb-4">Senha</p>
      <div className="space-y-3">
        <PasswordField
          label="Senha atual"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordField
          label="Nova senha"
          value={newPassword}
          onChange={setNewPassword}
        />
        <PasswordField
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {success && (
        <p className="mt-3 text-xs text-[#10B981]">
          Senha atualizada com sucesso!
        </p>
      )}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-4 rounded-md bg-copper px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {loading ? "Atualizando..." : "Atualizar senha"}
      </button>
    </section>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
      />
    </label>
  );
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !fullName.trim()) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatHours(h: number): string {
  if (h === 0) return "0h";
  const rounded = Math.round(h * 4) / 4;
  return `${rounded.toLocaleString("pt-BR")}h`;
}
