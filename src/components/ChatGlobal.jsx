import { useEffect, useMemo, useRef, useState } from 'react'
import { limitToLast, onValue, push, query, ref, remove, serverTimestamp } from 'firebase/database'
import { rtdb } from '../firebase'
import { formatarAutor } from '../utils/arquibancada'
import { POSICAO_PAINEL, visibilidadePainel } from './painelFlutuante'

/* ================================================================== */
/* Configuracao                                                         */
/* ================================================================== */

const CAMINHO_MENSAGENS = 'chatGlobal/mensagens'
const LIMITE_MENSAGENS = 60
const MAX_CARACTERES = 500
const INTERVALO_MINIMO_MS = 1500

export const TAGS_CHAT = ['Geral', 'Vou ao jogo hoje', 'Ingresso / Setor']

const ESTILO_TAG = {
  Geral: 'bg-slate-100 text-slate-600 ring-slate-200',
  'Vou ao jogo hoje': 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  'Ingresso / Setor': 'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
}

const chaveLeitura = (uid) => `diarioArquibancada:chatLidoAte:${uid}`

const lerMarcaLeitura = (uid) => {
  try {
    const valor = Number(window.localStorage.getItem(chaveLeitura(uid)))
    return Number.isFinite(valor) && valor > 0 ? valor : Date.now()
  } catch {
    return Date.now()
  }
}

const gravarMarcaLeitura = (uid, valor) => {
  try {
    window.localStorage.setItem(chaveLeitura(uid), String(valor))
  } catch {
    // Armazenamento indisponivel: o contador de nao lidas vale apenas para esta sessao
  }
}

/* ================================================================== */
/* Formatacao                                                           */
/* ================================================================== */

const formatarHora = (ms) =>
  typeof ms === 'number'
    ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''

const chaveDia = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const rotuloDia = (ms) => {
  const data = new Date(ms)
  const hoje = new Date()
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1)
  if (chaveDia(ms) === chaveDia(hoje.getTime())) return 'Hoje'
  if (chaveDia(ms) === chaveDia(ontem.getTime())) return 'Ontem'
  return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

// "Débora @deboracrf" -> { nome: "Débora", usuario: "deboracrf" }
const separarAutor = (autorFormatado) => {
  const texto = String(autorFormatado || 'Torcedor').trim()
  const indice = texto.indexOf(' @')
  if (indice < 0) return { nome: texto, usuario: '' }
  return { nome: texto.slice(0, indice), usuario: texto.slice(indice + 2) }
}

/* ================================================================== */
/* Icones                                                               */
/* ================================================================== */

const IconeFechar = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeLinecap="round" />
  </svg>
)

const IconeEnviar = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M10 15.5v-11M5.5 9L10 4.5 14.5 9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconeChat = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path
      d="M3.5 6A2.5 2.5 0 016 3.5h8A2.5 2.5 0 0116.5 6v5a2.5 2.5 0 01-2.5 2.5H9.5L6 16.5v-3A2.5 2.5 0 013.5 11V6z"
      strokeLinejoin="round"
    />
    <path d="M7 8.5h6" strokeLinecap="round" />
  </svg>
)

function EtiquetaTag({ tag }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-medium ring-1 ring-inset ${
        ESTILO_TAG[tag] || ESTILO_TAG.Geral
      }`}
    >
      {tag || 'Geral'}
    </span>
  )
}

/* ================================================================== */
/* Componente                                                           */
/* ================================================================== */

export default function ChatGlobal({
  aberto,
  onFechar,
  user,
  nome = '',
  username = '',
  onDefinirPerfil,
  onNaoLidasChange,
}) {
  const uid = user?.uid || null

  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [conectado, setConectado] = useState(true)
  const [erro, setErro] = useState('')

  const [texto, setTexto] = useState('')
  const [tag, setTag] = useState(TAGS_CHAT[0])
  const [enviando, setEnviando] = useState(false)
  const [confirmandoId, setConfirmandoId] = useState(null)

  const [lidoAte, setLidoAte] = useState(() => (uid ? lerMarcaLeitura(uid) : Date.now()))

  const areaRef = useRef(null)
  const campoRef = useRef(null)
  const pertoDoFimRef = useRef(true)
  const ultimoEnvioRef = useRef(0)
  const totalAnteriorRef = useRef(0)

  const autorFormatado = formatarAutor(nome, username)

  /* ------------------------- Assinatura em tempo real ------------------------- */

  useEffect(() => {
    if (!rtdb || !uid) {
      setCarregando(false)
      return undefined
    }

    setCarregando(true)
    const consulta = query(ref(rtdb, CAMINHO_MENSAGENS), limitToLast(LIMITE_MENSAGENS))

    const pararMensagens = onValue(
      consulta,
      (snapshot) => {
        const lista = []
        snapshot.forEach((filho) => {
          const valor = filho.val() || {}
          lista.push({
            id: filho.key,
            uid: valor.uid,
            autorFormatado: valor.autorFormatado,
            texto: valor.texto,
            tag: valor.tag,
            createdAt: typeof valor.createdAt === 'number' ? valor.createdAt : null,
          })
        })
        setMensagens(lista)
        setCarregando(false)
        setErro('')
      },
      (erroLeitura) => {
        console.error(erroLeitura)
        setCarregando(false)
        setErro(
          'Não foi possível carregar o chat. Verifique as regras e a URL do Realtime Database.',
        )
      },
    )

    const pararConexao = onValue(ref(rtdb, '.info/connected'), (snapshot) => {
      setConectado(snapshot.val() === true)
    })

    return () => {
      pararMensagens()
      pararConexao()
    }
  }, [uid])

  useEffect(() => {
    if (uid) setLidoAte(lerMarcaLeitura(uid))
  }, [uid])

  /* ------------------------- Nao lidas ------------------------- */

  const ultimaMensagemEm = mensagens.length ? mensagens[mensagens.length - 1].createdAt || 0 : 0

  // Enquanto o painel esta aberto, tudo o que chega fica marcado como lido
  useEffect(() => {
    if (!aberto || !uid) return
    const marca = Math.max(Date.now(), ultimaMensagemEm)
    setLidoAte(marca)
    gravarMarcaLeitura(uid, marca)
  }, [aberto, uid, ultimaMensagemEm])

  const naoLidas = useMemo(
    () =>
      aberto
        ? 0
        : mensagens.filter((m) => m.uid !== uid && typeof m.createdAt === 'number' && m.createdAt > lidoAte)
            .length,
    [aberto, mensagens, uid, lidoAte],
  )

  useEffect(() => {
    if (onNaoLidasChange) onNaoLidasChange(naoLidas)
  }, [naoLidas, onNaoLidasChange])

  /* ------------------------- Rolagem automatica ------------------------- */

  const rolarParaFim = () => {
    const area = areaRef.current
    if (area) area.scrollTop = area.scrollHeight
  }

  useEffect(() => {
    const chegouNova = mensagens.length !== totalAnteriorRef.current
    totalAnteriorRef.current = mensagens.length
    if (!chegouNova) return
    const ultima = mensagens[mensagens.length - 1]
    if (pertoDoFimRef.current || ultima?.uid === uid) {
      requestAnimationFrame(rolarParaFim)
    }
  }, [mensagens, uid])

  useEffect(() => {
    if (!aberto) return undefined
    pertoDoFimRef.current = true
    const quadro = requestAnimationFrame(rolarParaFim)
    const foco = window.setTimeout(() => campoRef.current?.focus({ preventScroll: true }), 150)
    return () => {
      cancelAnimationFrame(quadro)
      window.clearTimeout(foco)
    }
  }, [aberto])

  const aoRolar = () => {
    const area = areaRef.current
    if (!area) return
    pertoDoFimRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80
  }

  /* ------------------------- Acoes ------------------------- */

  const enviar = async (event) => {
    event.preventDefault()
    const conteudo = texto.replace(/\s+/g, ' ').trim()
    if (!conteudo || !rtdb || !uid || enviando) return

    if (conteudo.length > MAX_CARACTERES) {
      setErro(`A mensagem pode ter no máximo ${MAX_CARACTERES} caracteres.`)
      return
    }

    const agora = Date.now()
    if (agora - ultimoEnvioRef.current < INTERVALO_MINIMO_MS) {
      setErro('Aguarde um instante antes de enviar outra mensagem.')
      return
    }

    setEnviando(true)
    setErro('')
    setTexto('')
    ultimoEnvioRef.current = agora

    try {
      await push(ref(rtdb, CAMINHO_MENSAGENS), {
        uid,
        autorFormatado,
        texto: conteudo,
        tag: TAGS_CHAT.includes(tag) ? tag : TAGS_CHAT[0],
        createdAt: serverTimestamp(),
      })
    } catch (erroEnvio) {
      console.error(erroEnvio)
      setTexto(conteudo)
      setErro('Não foi possível enviar a mensagem. Tente novamente.')
    } finally {
      setEnviando(false)
      campoRef.current?.focus({ preventScroll: true })
    }
  }

  const apagar = async (mensagem) => {
    if (!rtdb || mensagem.uid !== uid) return
    try {
      await remove(ref(rtdb, `${CAMINHO_MENSAGENS}/${mensagem.id}`))
      setConfirmandoId(null)
    } catch (erroRemocao) {
      console.error(erroRemocao)
      setErro('Não foi possível apagar a mensagem.')
    }
  }

  /* ------------------------- Render ------------------------- */

  const restante = MAX_CARACTERES - texto.length

  return (
    <div
      role="dialog"
      aria-label="Chat da Arquibancada"
      aria-hidden={!aberto}
      inert={!aberto}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onFechar()
      }}
      className={`${POSICAO_PAINEL} ${visibilidadePainel(aberto)}`}
    >
      {/* Cabecalho */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <IconeChat className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-slate-900">Chat da Arquibancada</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
              <span className="relative flex h-2 w-2 shrink-0">
                {conectado ? (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                ) : null}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-slate-300'}`}
                />
              </span>
              {conectado ? 'Ao vivo · sala aberta 24h' : 'Reconectando...'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <IconeFechar className="h-4 w-4" />
        </button>
      </div>

      {/* Mensagens */}
      <div
        ref={areaRef}
        onScroll={aoRolar}
        aria-live="polite"
        className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-color:#e2e8f0_transparent] [scrollbar-width:thin]"
      >
        {!rtdb ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-900">Chat indisponível</p>
            <p className="mt-1 text-sm text-slate-500">
              Configure a variável VITE_FIREBASE_DATABASE_URL no arquivo .env para ativar o chat.
            </p>
          </div>
        ) : carregando ? (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
            Conectando ao chat...
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-900">Nenhuma mensagem ainda</p>
            <p className="mt-1 text-sm text-slate-500">
              Comece a conversa: combine a ida ao estádio ou pergunte sobre ingressos e setores.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mensagens.map((m, i) => {
              const anterior = mensagens[i - 1]
              const novoDia =
                typeof m.createdAt === 'number' &&
                (!anterior || typeof anterior.createdAt !== 'number' || chaveDia(anterior.createdAt) !== chaveDia(m.createdAt))
              const minha = m.uid === uid
              const { nome: nomeAutor, usuario } = separarAutor(m.autorFormatado)
              const confirmando = confirmandoId === m.id

              return (
                <div key={m.id}>
                  {novoDia ? (
                    <div className="my-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-slate-100" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                        {rotuloDia(m.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-slate-100" />
                    </div>
                  ) : null}

                  {minha ? (
                    <div className="flex flex-col items-end">
                      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-sm text-white">
                        {m.texto}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <EtiquetaTag tag={m.tag} />
                        <span className="tabular-nums">{formatarHora(m.createdAt)}</span>
                        {confirmando ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-rose-600">Apagar mensagem?</span>
                            <button
                              type="button"
                              onClick={() => apagar(m)}
                              className="font-medium text-rose-600 underline-offset-2 hover:underline"
                            >
                              Sim
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoId(null)}
                              className="font-medium text-slate-500 underline-offset-2 hover:underline"
                            >
                              Não
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmandoId(m.id)}
                            className="text-slate-400 transition hover:text-rose-600"
                          >
                            Apagar
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start">
                      <p className="mb-1 flex max-w-[85%] items-baseline gap-1 truncate text-xs">
                        <span className="font-semibold text-slate-800">{nomeAutor}</span>
                        {usuario ? <span className="truncate text-slate-400">@{usuario}</span> : null}
                      </p>
                      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-slate-50 px-3.5 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200/70">
                        {m.texto}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <EtiquetaTag tag={m.tag} />
                        <span className="tabular-nums">{formatarHora(m.createdAt)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Envio */}
      <form onSubmit={enviar} className="border-t border-slate-100 px-4 pb-4 pt-3">
        {!username ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">Defina o seu @usuario para se identificar no chat.</p>
            {onDefinirPerfil ? (
              <button
                type="button"
                onClick={onDefinirPerfil}
                className="shrink-0 whitespace-nowrap text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                Definir agora
              </button>
            ) : null}
          </div>
        ) : null}

        {erro ? (
          <p role="alert" className="mb-2.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {erro}
          </p>
        ) : null}

        <div role="radiogroup" aria-label="Tag da mensagem" className="mb-2.5 flex flex-wrap gap-1.5">
          {TAGS_CHAT.map((opcao) => {
            const ativa = tag === opcao
            return (
              <button
                key={opcao}
                type="button"
                role="radio"
                aria-checked={ativa}
                onClick={() => setTag(opcao)}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  ativa
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {opcao}
              </button>
            )
          })}
        </div>

        <div className="relative">
          <input
            ref={campoRef}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_CARACTERES))}
            maxLength={MAX_CARACTERES}
            disabled={!rtdb || !uid}
            placeholder="Escreva para a arquibancada"
            aria-label="Mensagem"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={!texto.trim() || enviando || !rtdb || !uid}
            aria-label="Enviar mensagem"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <IconeEnviar className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
          <span className="truncate">Enviando como {autorFormatado}</span>
          {restante <= 100 ? <span className="shrink-0 tabular-nums">{restante}</span> : null}
        </div>
      </form>
    </div>
  )
}
