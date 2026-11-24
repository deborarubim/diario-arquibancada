import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const MENSAGENS_ERRO = {
  'auth/invalid-credential':
    'E-mail ou senha incorretos. Verifique os dados ou use "Esqueci minha senha" para criar uma nova.',
  'auth/wrong-password':
    'E-mail ou senha incorretos. Verifique os dados ou use "Esqueci minha senha" para criar uma nova.',
  'auth/user-not-found':
    'E-mail ou senha incorretos. Verifique os dados ou use "Esqueci minha senha" para criar uma nova.',
  'auth/invalid-email': 'O e-mail informado não é válido.',
  'auth/user-disabled': 'Esta conta está desativada. Entre em contato com o suporte.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Falha de conexão. Verifique a sua internet e tente novamente.',
}

const MENSAGENS_ERRO_RECUPERACAO = {
  'auth/missing-email': 'Informe o e-mail da sua conta para receber o link de redefinição.',
  'auth/invalid-email': 'O e-mail informado não é válido. Confira se foi digitado corretamente.',
  'auth/user-disabled': 'Esta conta está desativada. Entre em contato com o suporte.',
  'auth/too-many-requests':
    'Muitas solicitações seguidas. Aguarde alguns minutos antes de pedir um novo link.',
  'auth/quota-exceeded': 'O limite de envio de e-mails foi atingido por agora. Tente novamente mais tarde.',
  'auth/network-request-failed': 'Falha de conexão. Verifique a sua internet e tente novamente.',
  'auth/operation-not-allowed':
    'A recuperação de senha não está ativa. Ative o provedor E-mail/senha no Console do Firebase.',
}

// Com a proteção contra enumeração de e-mails, o Firebase pode ou não informar que a conta não existe.
// Em ambos os casos a tela mostra a mesma mensagem neutra, para não revelar quais e-mails estão cadastrados.
const ERROS_TRATADOS_COMO_ENVIO = ['auth/user-not-found']

const ESPERA_REENVIO_SEGUNDOS = 30

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5'

const labelClass = 'mb-1.5 block text-xs font-medium text-slate-600'

const botaoPrimario =
  'h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'

const botaoSecundario =
  'h-11 w-full whitespace-nowrap rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'

const ROTA_PAINEL = '/dashboard'

function AlertaErro({ children }) {
  return (
    <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
      {children}
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [autenticou, setAutenticou] = useState(false)
  const [saindo, setSaindo] = useState(false)

  // Recuperação de senha
  const [modo, setModo] = useState('entrar') // 'entrar' | 'recuperar'
  const [erroRecuperacao, setErroRecuperacao] = useState('')
  const [enviandoLink, setEnviandoLink] = useState(false)
  const [linkEnviadoPara, setLinkEnviadoPara] = useState('')
  const [esperaReenvio, setEsperaReenvio] = useState(0)
  const emailRecuperacaoRef = useRef(null)

  const { login, logout, redefinirSenha, user, profile, loading: carregandoSessao } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Volta para a pagina protegida que o utilizador tentou abrir, ou para o painel
  const origem = location.state?.from?.pathname
  const destino = origem && origem !== '/' ? origem : ROTA_PAINEL

  // Redireciona apenas depois de o contexto reconhecer o utilizador autenticado
  useEffect(() => {
    if (autenticou && user) navigate(destino, { replace: true })
  }, [autenticou, user, destino, navigate])

  // Contagem regressiva para permitir reenviar o link
  useEffect(() => {
    if (esperaReenvio <= 0) return undefined
    const temporizador = window.setTimeout(() => setEsperaReenvio((s) => s - 1), 1000)
    return () => window.clearTimeout(temporizador)
  }, [esperaReenvio])

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

  /* ------------------------- Recuperação de senha ------------------------- */

  const abrirRecuperacao = () => {
    setError('')
    setLinkEnviadoPara('')
    setModo('recuperar')
    // Aproveita o e-mail já digitado; se estiver vazio, pede para preencher
    setErroRecuperacao(
      email.trim() ? '' : 'Informe o e-mail da sua conta para receber o link de redefinição.',
    )
    window.setTimeout(() => emailRecuperacaoRef.current?.focus(), 0)
  }

  const voltarParaLogin = () => {
    setModo('entrar')
    setErroRecuperacao('')
    setLinkEnviadoPara('')
  }

  const enviarLink = async (e) => {
    e?.preventDefault()
    setErroRecuperacao('')

    const emailLimpo = email.trim()
    if (!emailLimpo) {
      setErroRecuperacao(MENSAGENS_ERRO_RECUPERACAO['auth/missing-email'])
      emailRecuperacaoRef.current?.focus()
      return
    }
    if (!EMAIL_VALIDO.test(emailLimpo)) {
      setErroRecuperacao(MENSAGENS_ERRO_RECUPERACAO['auth/invalid-email'])
      emailRecuperacaoRef.current?.focus()
      return
    }

    setEnviandoLink(true)
    try {
      await redefinirSenha(emailLimpo)
      setLinkEnviadoPara(emailLimpo)
      setEsperaReenvio(ESPERA_REENVIO_SEGUNDOS)
    } catch (err) {
      if (ERROS_TRATADOS_COMO_ENVIO.includes(err?.code)) {
        setLinkEnviadoPara(emailLimpo)
        setEsperaReenvio(ESPERA_REENVIO_SEGUNDOS)
      } else {
        console.error(err)
        setErroRecuperacao(
          MENSAGENS_ERRO_RECUPERACAO[err?.code] ||
            'Não foi possível enviar o link agora. Tente novamente em instantes.',
        )
      }
    } finally {
      setEnviandoLink(false)
    }
  }

  const sessaoAtiva = Boolean(user) && !autenticou && !enviando
  const nomeSessao =
    String(profile?.nome || user?.displayName || '').replace(/\s+/g, ' ').trim() || user?.email || ''

  const emRecuperacao = modo === 'recuperar' && !sessaoAtiva

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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {emRecuperacao ? 'Redefinir senha' : 'Entrar'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {emRecuperacao
                ? 'Enviaremos um link para o seu e-mail para você criar uma nova senha.'
                : 'Acesse o seu painel de arquibancada.'}
            </p>
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
                  className={`${botaoPrimario} whitespace-nowrap`}
                >
                  Continuar para o painel
                </button>
                <button type="button" onClick={handleTrocarConta} disabled={saindo} className={botaoSecundario}>
                  {saindo ? 'Saindo...' : 'Entrar com outra conta'}
                </button>
              </div>
            </div>
          ) : emRecuperacao ? (
            linkEnviadoPara ? (
              /* ---------------- Link enviado ---------------- */
              <div>
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-800">Verifique o seu e-mail</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-emerald-700">
                    Se existir uma conta com <span className="font-medium break-all">{linkEnviadoPara}</span>, você
                    receberá em alguns minutos um link para criar uma nova senha.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-700">
                    Não encontrou? Confira também a caixa de spam ou lixo eletrônico.
                  </p>
                </div>

                {erroRecuperacao ? (
                  <div className="mt-4">
                    <AlertaErro>{erroRecuperacao}</AlertaErro>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-2">
                  <button type="button" onClick={voltarParaLogin} className={botaoPrimario}>
                    Voltar para o login
                  </button>
                  <button
                    type="button"
                    onClick={() => enviarLink()}
                    disabled={enviandoLink || esperaReenvio > 0}
                    className={botaoSecundario}
                  >
                    {enviandoLink
                      ? 'Reenviando...'
                      : esperaReenvio > 0
                        ? `Reenviar link em ${esperaReenvio}s`
                        : 'Reenviar link'}
                  </button>
                </div>
              </div>
            ) : (
              /* ---------------- Pedido do link ---------------- */
              <>
                {erroRecuperacao ? <AlertaErro>{erroRecuperacao}</AlertaErro> : null}

                <form onSubmit={enviarLink} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="email-recuperacao" className={labelClass}>
                      E-mail da conta
                    </label>
                    <input
                      ref={emailRecuperacaoRef}
                      id="email-recuperacao"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (erroRecuperacao) setErroRecuperacao('')
                      }}
                      placeholder="seu@email.com"
                      className={inputClass}
                    />
                  </div>

                  <button type="submit" disabled={enviandoLink} className={`${botaoPrimario} mt-2`}>
                    {enviandoLink ? 'Enviando...' : 'Enviar link de redefinição'}
                  </button>
                  <button type="button" onClick={voltarParaLogin} className={botaoSecundario}>
                    Voltar para o login
                  </button>
                </form>
              </>
            )
          ) : (
            /* ---------------- Login ---------------- */
            <>
              {error ? <AlertaErro>{error}</AlertaErro> : null}

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
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="senha" className="block text-xs font-medium text-slate-600">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={abrirRecuperacao}
                      className="whitespace-nowrap text-xs font-medium text-slate-500 underline-offset-4 transition hover:text-slate-900 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
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

                <button type="submit" disabled={enviando} className={`${botaoPrimario} mt-2`}>
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
