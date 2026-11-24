import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const MENSAGENS_ERRO = {
  'auth/invalid-credential': 'E-mail ou senha incorretos. Verifique os dados e tente novamente.',
  'auth/wrong-password': 'E-mail ou senha incorretos. Verifique os dados e tente novamente.',
  'auth/user-not-found': 'E-mail ou senha incorretos. Verifique os dados e tente novamente.',
  'auth/invalid-email': 'O e-mail informado não é válido.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Falha de conexão. Verifique a sua internet e tente novamente.',
}

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5'

const labelClass = 'mb-1.5 block text-xs font-medium text-slate-600'

const ROTA_PAINEL = '/dashboard'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [autenticou, setAutenticou] = useState(false)
  const [saindo, setSaindo] = useState(false)

  const { login, logout, user, profile, loading: carregandoSessao } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Volta para a pagina protegida que o utilizador tentou abrir, ou para o painel
  const origem = location.state?.from?.pathname
  const destino = origem && origem !== '/' ? origem : ROTA_PAINEL

  // Redireciona apenas depois de o contexto reconhecer o utilizador autenticado
  useEffect(() => {
    if (autenticou && user) navigate(destino, { replace: true })
  }, [autenticou, user, destino, navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)

    try {
      await login(email.trim(), senha)
      setAutenticou(true)
    } catch (err) {
      console.error(err)
      setError(
        MENSAGENS_ERRO[err?.code] ||
          'Não foi possível entrar. Verifique os dados e tente novamente.',
      )
      setEnviando(false)
    }
  }

  const handleTrocarConta = async () => {
    setSaindo(true)
    try {
      await logout()
    } finally {
      setSaindo(false)
    }
  }

  const sessaoAtiva = Boolean(user) && !autenticou && !enviando
  const nomeSessao =
    String(profile?.nome || user?.displayName || '').replace(/\s+/g, ' ').trim() || user?.email || ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-semibold tracking-wide text-white">
            DA
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            Diário de Arquibancada
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)]">
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
            <p className="mt-1.5 text-sm text-slate-500">Acesse o seu painel de arquibancada.</p>
          </div>

          {carregandoSessao ? (
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
              Verificando sessão...
            </div>
          ) : sessaoAtiva ? (
            <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Sessão ativa</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-900">{nomeSessao}</p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => navigate(destino, { replace: true })}
                  className="h-11 w-full whitespace-nowrap rounded-lg bg-slate-900 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                >
                  Continuar para o painel
                </button>
                <button
                  type="button"
                  onClick={handleTrocarConta}
                  disabled={saindo}
                  className="h-11 w-full whitespace-nowrap rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {saindo ? 'Saindo...' : 'Entrar com outra conta'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {error ? (
                <div
                  role="alert"
                  className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
                >
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className={labelClass}>
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="senha" className={labelClass}>
                    Senha
                  </label>
                  <input
                    id="senha"
                    type="password"
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                    placeholder="Sua senha"
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="mt-2 h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enviando ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Ainda não tem cadastro?{' '}
          <Link to="/register" className="font-medium text-slate-900 underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}
