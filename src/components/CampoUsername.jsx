import { formatarAutor, normalizarUsername, USERNAME_MAX, USERNAME_MIN } from '../utils/arquibancada'

/*
  Campo de @usuario com normalização ao digitar e estado de disponibilidade.
  O estado vem do hook useDisponibilidadeUsername.
*/

const ESTILO_ESTADO = {
  vazio: 'text-slate-400',
  invalido: 'text-slate-500',
  atual: 'text-slate-500',
  verificando: 'text-slate-400',
  disponivel: 'text-emerald-600',
  indisponivel: 'text-rose-600',
  erro: 'text-slate-500',
}

const Indicador = ({ estado }) => {
  if (estado === 'verificando') {
    return (
      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-slate-200 border-t-slate-500" />
    )
  }
  if (estado === 'disponivel' || estado === 'atual') {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 10.5l3.2 3.2L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (estado === 'indisponivel') {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
      </svg>
    )
  }
  return null
}

export const mensagemEstadoUsername = (estado, username, nome) => {
  const previa = nome && username ? ` No chat: ${formatarAutor(nome, username)}.` : ''
  switch (estado) {
    case 'invalido':
      return `Use de ${USERNAME_MIN} a ${USERNAME_MAX} caracteres: letras minúsculas, números, ponto ou sublinhado.`
    case 'atual':
      return `Este é o seu @usuario atual.${previa}`
    case 'verificando':
      return 'Verificando disponibilidade...'
    case 'disponivel':
      return `@${username} está disponível.${previa}`
    case 'indisponivel':
      return `O @${username} já está em uso. Escolha outro nome de usuário.`
    case 'erro':
      return 'Não foi possível verificar agora. A disponibilidade será confirmada ao salvar.'
    default:
      return 'Letras minúsculas, números, ponto ou sublinhado. Sem espaços.'
  }
}

export default function CampoUsername({
  id,
  value,
  onChange,
  estado,
  nome = '',
  inputClassName = '',
  autoFocus = false,
}) {
  const indisponivel = estado === 'indisponivel'
  const idAjuda = `${id}-ajuda`

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
          @
        </span>
        <input
          id={id}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus={autoFocus}
          spellCheck={false}
          maxLength={USERNAME_MAX}
          value={value}
          onChange={(e) => onChange(normalizarUsername(e.target.value))}
          placeholder="deboracrf"
          aria-invalid={indisponivel}
          aria-describedby={idAjuda}
          className={`${inputClassName} pl-8`}
        />
      </div>
      <p
        id={idAjuda}
        aria-live="polite"
        className={`mt-1.5 flex items-center gap-1.5 text-xs ${ESTILO_ESTADO[estado] || ESTILO_ESTADO.vazio}`}
      >
        <Indicador estado={estado} />
        <span>{mensagemEstadoUsername(estado, value, nome)}</span>
      </p>
    </div>
  )
}
