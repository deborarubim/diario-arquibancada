import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const CLUBES_BRASILEIROS = [
  'Athletico-PR',
  'Atlético-GO',
  'Atlético-MG',
  'Bahia',
  'Botafogo',
  'Ceará',
  'Corinthians',
  'Cruzeiro',
  'Cuiabá',
  'Flamengo',
  'Fluminense',
  'Fortaleza',
  'Grêmio',
  'Internacional',
  'Juventude',
  'Palmeiras',
  'RB Bragantino',
  'Santos',
  'São Paulo',
  'Vasco',
  'Vitória',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const MENSAGENS_ERRO = {
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Tente entrar na sua conta.',
  'auth/invalid-email': 'O e-mail informado não é válido.',
  'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Falha de conexão. Verifique a sua internet e tente novamente.',
}

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5'

const labelClass = 'mb-1.5 block text-xs font-medium text-slate-600'

export default function RegisterPage() {
  const [nome, setNome] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [time, setTime] = useState('Flamengo')

  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef(null)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cadastrou, setCadastrou] = useState(false)
  const { signUp, user } = useAuth()
  const navigate = useNavigate()

  // Vai para o painel so quando o contexto ja reconhece o utilizador autenticado
  useEffect(() => {
    if (cadastrou && user) navigate('/dashboard', { replace: true })
  }, [cadastrou, user, navigate])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const clubesFiltrados = CLUBES_BRASILEIROS.filter((clube) =>
    clube.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    const nomeLimpo = nome.replace(/\s+/g, ' ').trim()
    if (nomeLimpo.length < 2) {
      setError('Informe o seu nome completo.')
      return
    }

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/\s+/g, '_')
    if (!/^[a-z0-9._]{3,24}$/.test(cleanUsername)) {
      setError('O nome de usuário deve ter de 3 a 24 caracteres: letras, números, ponto ou sublinhado.')
      return
    }

    if (senha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (!CLUBES_BRASILEIROS.includes(time)) {
      setError('Selecione um clube válido da lista oficial.')
      return
    }

    setLoading(true)
    try {
      await signUp(email.trim(), senha, {
        nome: nomeLimpo,
        username: cleanUsername,
        time,
        orcamentoMensal: 0,
      })
      setCadastrou(true)
    } catch (err) {
      console.error(err)
      setError(MENSAGENS_ERRO[err?.code] || err?.message || 'Não foi possível criar a conta.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-[440px]">
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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Criar conta</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Registre os seus jogos, ingressos e estádios numa só visão.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            <div>
              <label htmlFor="nome" className={labelClass}>
                Nome completo
              </label>
              <input
                id="nome"
                type="text"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Ex.: Débora Gomes"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="username" className={labelClass}>
                Nome de usuário
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Ex.: debora_crf"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
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
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                placeholder="Mínimo de 6 caracteres"
                className={inputClass}
              />
            </div>

            <div className="relative" ref={dropdownRef}>
              <span className={labelClass}>Time do coração</span>
              <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className={`${inputClass} flex items-center justify-between text-left`}
              >
                <span>{time}</span>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen ? (
                <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.2)]">
                  <input
                    type="text"
                    autoFocus
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pesquisar clube"
                    className="mb-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  />
                  <div role="listbox" className="max-h-52 overflow-y-auto [scrollbar-width:thin]">
                    {clubesFiltrados.length === 0 ? (
                      <p className="py-3 text-center text-sm text-slate-400">Nenhum clube encontrado</p>
                    ) : (
                      clubesFiltrados.map((clube) => (
                        <button
                          key={clube}
                          type="button"
                          role="option"
                          aria-selected={time === clube}
                          onClick={() => {
                            setTime(clube)
                            setIsOpen(false)
                            setSearchTerm('')
                          }}
                          className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition ${
                            time === clube
                              ? 'bg-slate-900 font-medium text-white'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {clube}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Já tem conta?{' '}
          <Link to="/" className="font-medium text-slate-900 underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
