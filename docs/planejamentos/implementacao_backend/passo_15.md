# Passo 15 — Perfil: edição de dados, avatar e senha

## Objetivo

Conectar `/perfil` ao banco — exibir horas do mês e streak reais, carregar e editar nome, exibir e-mail (somente leitura), trocar avatar com upload no Storage, e alterar senha com verificação da senha atual.

---

## Estado após o Passo 14

- `backend/api/services/dashboard.service.ts` — `getDashboardData`, lógica de streak
- `backend/api/services/users.service.ts` — `getProfile`, `updateProfile`, `getOrgMembers`; tipo `UserProfile`
- `backend/api/services/auth.service.ts` — `signIn`, `signUp`, `signOut`, `getSession`
- `src/routes/_authenticated.tsx` — contexto com `{ profile }` (id, full_name, avatar_url, role, organization_id)
- `src/routes/perfil.tsx` — **não migrada**, rota `/perfil`, `Field` sem `value`/`onChange`, avatar placeholder sem funcionalidade, stats com `"—"`, sem loader

---

## Escopo deste passo

| Funcionalidade | Neste passo |
|----------------|-------------|
| Horas do mês e streak reais | ✅ |
| Carregar nome e avatar do banco | ✅ |
| Exibir e-mail (somente leitura) | ✅ |
| Editar nome | ✅ |
| Upload de avatar para o Storage | ✅ |
| Alterar senha (com verificação da atual) | ✅ |

---

## Contexto técnico

**E-mail vem de `auth.users`, não de `profiles`.** A tabela `profiles` não armazena `email`. Para exibi-lo, é necessário chamar `supabase.auth.getUser()` via `auth.service.ts`. Uma função `getCurrentUserEmail()` encapsula isso sem importar `supabase` diretamente na rota.

**`getProfileStats` em `users.service.ts`.** O heatmap do perfil precisa de horas do mês e streak — os mesmos dados calculados em `dashboard.service.ts`. Em vez de duplicar toda a lógica de `getDashboardData`, uma função leve `getProfileStats` em `users.service.ts` busca apenas `date` e `hours_worked` dos últimos 60 dias de apontamentos. A lógica de streak (loop de dias consecutivos) é copiada, pois é código puro sem dependências externas.

**`uploadAvatar` faz upsert no Storage.** O bucket `avatars` é público. O path é `{userId}.ext`. O upsert (`{ upsert: true }`) substitui o avatar existente sem precisar deletar antes. Após o upload, `updateProfile` atualiza `avatar_url` no banco e o estado local é atualizado para refletir imediatamente na página.

**Verificação da senha atual via re-autenticação.** O Supabase JS não tem um método `reAuthenticate`. Para validar que o usuário conhece a senha atual antes de alterá-la, chamamos `signIn(email, currentPassword)`. Se falhar, exibimos erro sem prosseguir. Se suceder, chamamos `updatePassword(newPassword)`.

**Três seções independentes com estado isolado.** Avatar, informações pessoais e senha são componentes separados, cada um com seu próprio `useState`. Isso evita que o loading de um bloqueie os outros e simplifica o gerenciamento de estados de feedback (salvando, salvo, erro).

**Botão "Salvar alterações" desativado quando não há mudança.** O botão compara o valor atual do input com o valor inicial do loader (`initialName`). Se forem iguais, `disabled`. Isso previne chamadas ao banco desnecessárias.

---

## Implementação

### 15.1 — Adicionar `getCurrentUserEmail` e `updatePassword` a `auth.service.ts`

**Arquivo:** `backend/api/services/auth.service.ts` (adicionar ao arquivo existente)

- [ ] Adicionar `getCurrentUserEmail`
- [ ] Adicionar `updatePassword` (se ainda não existir)

```ts
export async function getCurrentUserEmail(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? ''
}

export async function updatePassword(
  newPassword: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return { error: error as Error | null }
}
```

---

### 15.2 — Adicionar `getProfileStats` e `uploadAvatar` a `users.service.ts`

**Arquivo:** `backend/api/services/users.service.ts` (adicionar ao arquivo existente)

- [ ] Adicionar o tipo `ProfileStats` e a função `getProfileStats`
- [ ] Adicionar `uploadAvatar`

```ts
export type ProfileStats = {
  horasNoMes: number
  streak: number
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0]

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('apontamentos')
    .select('date, hours_worked')
    .eq('user_id', userId)
    .gte('date', sixtyDaysAgoStr)

  const rows = data ?? []
  const monthRows = rows.filter(r => new Date(r.date + 'T00:00:00') >= monthStart)
  const horasNoMes = monthRows.reduce((sum, r) => sum + Number(r.hours_worked), 0)

  const daySet = new Set(rows.map(r => r.date))
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  let streak = 0
  while (true) {
    const dateStr = cursor.toISOString().split('T')[0]
    if (daySet.has(dateStr)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return { horasNoMes, streak }
}

export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${userId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return null

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

  await updateProfile(userId, { avatar_url: publicUrl })

  return publicUrl
}
```

---

### 15.3 — Migrar e reescrever `perfil.tsx`

**Arquivo:** `src/routes/_authenticated.perfil.tsx` (criar novo)  
**Arquivo:** `src/routes/perfil.tsx` (deletar após criar o novo)

- [ ] Criar `_authenticated.perfil.tsx` com loader e três seções funcionais
- [ ] Deletar `src/routes/perfil.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Camera, Flame } from 'lucide-react'
import { useState, useRef } from 'react'
import { AppShell } from '@/components/AppShell'
import {
  getProfileStats,
  uploadAvatar,
  updateProfile,
  type ProfileStats,
  type UserProfile,
} from 'backend/api/services/users.service'
import {
  getCurrentUserEmail,
  signIn,
  updatePassword,
} from 'backend/api/services/auth.service'

export const Route = createFileRoute('/_authenticated/perfil')({
  head: () => ({
    meta: [
      { title: 'Perfil — Marco' },
      { name: 'description', content: 'Sua conta e preferências.' },
    ],
  }),
  loader: async ({ context }) => {
    const userId = context.profile.id
    const [stats, email] = await Promise.all([
      getProfileStats(userId),
      getCurrentUserEmail(),
    ])
    return {
      profile: context.profile as UserProfile,
      stats,
      email,
    }
  },
  component: () => (
    <AppShell title="Perfil">
      <Perfil />
    </AppShell>
  ),
})

function Perfil() {
  const { profile, stats, email } = Route.useLoaderData()
  const initials = getInitials(profile.full_name)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Resumo */}
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
  )
}

function AvatarSection({
  userId,
  initialAvatarUrl,
  initials,
}: {
  userId: string
  initialAvatarUrl: string | null
  initials: string
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const url = await uploadAvatar(userId, file)
    if (url) setAvatarUrl(url)
    setUploading(false)
    e.target.value = ''
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
          {uploading ? 'Enviando…' : 'Clique na foto para enviar uma nova imagem.'}
        </p>
      </div>
    </section>
  )
}

function PersonalInfoSection({
  userId,
  initialName,
  email,
}: {
  userId: string
  initialName: string
  email: string
}) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    await updateProfile(userId, { full_name: trimmed })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const unchanged = name.trim() === initialName

  return (
    <section className="p-6">
      <p className="section-label mb-4">Informações pessoais</p>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</span>
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
        {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar alterações'}
      </button>
    </section>
  )
}

function PasswordSection({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    setError('')
    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }
    setLoading(true)
    const { error: signInError } = await signIn(email, currentPassword)
    if (signInError) {
      setError('Senha atual incorreta')
      setLoading(false)
      return
    }
    const { error: updateError } = await updatePassword(newPassword)
    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(false), 3000)
    }
    setLoading(false)
  }

  const canSubmit = Boolean(currentPassword && newPassword && confirmPassword) && !loading

  return (
    <section className="p-6">
      <p className="section-label mb-4">Senha</p>
      <div className="space-y-3">
        <PasswordField label="Senha atual" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField label="Nova senha" value={newPassword} onChange={setNewPassword} />
        <PasswordField
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {success && <p className="mt-3 text-xs text-[#10B981]">Senha atualizada com sucesso!</p>}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-4 rounded-md bg-copper px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {loading ? 'Atualizando…' : 'Atualizar senha'}
      </button>
    </section>
  )
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="new-password"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-copper focus:outline-none"
      />
    </label>
  )
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0 || !fullName.trim()) return '?'
  return parts
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')
}

function formatHours(h: number): string {
  if (h === 0) return '0h'
  const rounded = Math.round(h * 4) / 4
  return `${rounded.toLocaleString('pt-BR')}h`
}
```

---

## Verificação manual

### Cenário 1 — Carregar dados do perfil

1. Fazer login e navegar para `/perfil`
2. **Esperado:**
   - "Horas este mês" exibe soma de `hours_worked` do mês corrente
   - "Sequência" exibe número de dias consecutivos com apontamento
   - Avatar exibe a foto se `avatar_url` estiver preenchido; caso contrário, exibe iniciais do nome
   - Campo "Nome" preenchido com `profile.full_name`
   - Campo "E-mail" preenchido com o e-mail da conta, desabilitado

### Cenário 2 — Editar nome

1. Alterar o conteúdo do campo "Nome"
2. Botão "Salvar alterações" fica habilitado
3. Clicar "Salvar alterações"
4. **Esperado:** botão muda para "Salvando…" → "Salvo!" → volta ao normal após 2s
5. Verificar no Supabase: `profiles.full_name` atualizado
6. Limpar o campo e tentar salvar → botão permanece desabilitado (campo vazio = trim = "")

### Cenário 3 — Sem mudança no nome

1. Abrir `/perfil` com nome "João Silva"
2. Clicar no campo, apagar e redigitar exatamente "João Silva"
3. **Esperado:** botão "Salvar alterações" permanece desabilitado (valor igual ao inicial)

### Cenário 4 — Upload de avatar

1. Passar o mouse sobre o avatar → ícone de câmera aparece
2. Clicar → seletor de arquivo abre
3. Escolher uma imagem (jpg/png)
4. **Esperado:** texto muda para "Enviando…"; após upload, avatar na página atualiza para a nova foto
5. Verificar no Supabase Storage: arquivo em `avatars/{userId}.ext` substituído
6. Verificar no banco: `profiles.avatar_url` atualizado com a URL pública

### Cenário 5 — Alterar senha com sucesso

1. Preencher senha atual (correta), nova senha (≥ 6 chars) e confirmação iguais
2. Clicar "Atualizar senha"
3. **Esperado:** "Atualizando…" → mensagem verde "Senha atualizada com sucesso!" → campos limpos após 3s
4. Fazer logout e login com a nova senha → deve funcionar

### Cenário 6 — Erros na troca de senha

1. Preencher senha atual incorreta → "Senha atual incorreta" em vermelho
2. Nova senha com menos de 6 caracteres → "A nova senha deve ter pelo menos 6 caracteres"
3. Confirmação diferente da nova senha → "As senhas não coincidem"
4. Campos vazios → botão desabilitado

---

## Requisitos para considerar concluído

- [ ] `getCurrentUserEmail` e `updatePassword` adicionados a `auth.service.ts`
- [ ] `ProfileStats`, `getProfileStats`, `uploadAvatar` adicionados a `users.service.ts`
- [ ] `src/routes/_authenticated.perfil.tsx` criado com route path `/_authenticated/perfil`
- [ ] `src/routes/perfil.tsx` deletado
- [ ] Loader busca `stats` e `email` em paralelo via `Promise.all`
- [ ] "Horas este mês" e "Sequência" exibem valores reais
- [ ] Avatar exibe `<img>` se `avatar_url` preenchido; initials se não
- [ ] File input oculto acionado pelo clique no avatar
- [ ] Upload faz upsert em `avatars/{userId}.ext` e atualiza estado local
- [ ] Campo "Nome" controlado; "Salvar" desabilitado quando sem mudança
- [ ] Campo "E-mail" exibe e-mail do auth, desabilitado e sem edição
- [ ] Troca de senha verifica senha atual via `signIn` antes de prosseguir
- [ ] Mensagens de erro e sucesso exibidas corretamente em cada seção

---

## O que não fazer

- Não importar `supabase` diretamente na rota — usar `getCurrentUserEmail()` de `auth.service.ts` para obter o e-mail
- Não tentar editar o e-mail — Supabase Auth exige fluxo de confirmação por e-mail para alterar endereço; fora do escopo deste plano
- Não atualizar o avatar no `AppShell` (sidebar) neste passo — a sidebar usa o perfil carregado na `/_authenticated.tsx` que não é recarregado após upload; atualizar exigiria contexto global ou re-execução do loader pai; deixar para uma iteração futura
- Não usar `defaultValue` nos inputs desta página — aqui os campos são controlados (`value` + `onChange`) porque precisamos comparar com o valor inicial para habilitar/desabilitar o botão de salvar
- Não fazer `signIn` sem verificar se email está preenchido antes de chamar — o loader garante que `email` sempre vem do `auth.getUser()`, então é seguro usar diretamente

---

## Próximo Passo

Após concluir: executar `passo_16.md` — conectar `/admin/membros` para listar membros ativos, exibir código da organização, gerenciar pedidos pendentes e remover membros.
