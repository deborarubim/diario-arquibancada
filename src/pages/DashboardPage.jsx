import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../hooks/useAuth'
import AssistenteArquibancada from '../components/AssistenteArquibancada'
import {
  MESES_ABREVIADOS,
  OPCOES_MES,
  STATUS_AGUARDANDO,
  STATUS_COMPRADO,
  calcularEstatisticas,
  descreverDistancia,
  diaDaSemana,
  diasAteJogo,
  formatCurrency,
  formatarDataBr,
  iniciais,
  jogosDoPeriodo,
  limparTexto,
  normalizarJogo,
  ordenarAgenda,
  parseCurrency,
  parseDataJogo,
  plural,
} from '../utils/arquibancada'

/* ================================================================== */
/* Dados de referencia                                                  */
/* ================================================================== */

const COR_TIME = {
  'Athletico-PR': '#c8102e',
  'Atlético-GO': '#c8102e',
  'Atlético-MG': '#18181b',
  Bahia: '#0057a8',
  Botafogo: '#18181b',
  Ceará: '#18181b',
  Corinthians: '#18181b',
  Cruzeiro: '#1d4ed8',
  Cuiabá: '#15803d',
  Flamengo: '#c8102e',
  Fluminense: '#7a1e3a',
  Fortaleza: '#1e3a8a',
  Grêmio: '#0b7ac4',
  Internacional: '#d71920',
  Juventude: '#15803d',
  Palmeiras: '#006437',
  'RB Bragantino': '#c8102e',
  Santos: '#18181b',
  'São Paulo': '#d71920',
  Vasco: '#18181b',
  Vitória: '#c8102e',
}

// Paleta sobria e distinguivel, usada de forma ciclica nas roscas
const CORES_GRAFICO = [
  '#4338ca',
  '#0284c7',
  '#0d9488',
  '#d97706',
  '#e11d48',
  '#7c3aed',
  '#475569',
  '#65a30d',
]

const OPCOES_CAMPEONATO = [
  'Brasileirão',
  'Copa do Brasil',
  'Libertadores',
  'Sul-Americana',
  'Estadual',
  'Amistoso',
]

const ordenar = (lista) => [...lista].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const DADOS_COMPETICAO = {
  Carioca: {
    nomeEstadual: 'Campeonato Carioca',
    adversarios: ordenar([
      'Bangu', 'Boavista', 'Botafogo', 'Flamengo', 'Fluminense',
      'Madureira', 'Nova Iguaçu', 'Portuguesa-RJ', 'Sampaio Corrêa', 'Vasco', 'Volta Redonda',
    ]),
    estadios: ['Maracanã', 'São Januário', 'Nilton Santos (Engenhão)', 'Luso-Brasileiro', 'Raulino de Oliveira', 'Moça Bonita'],
  },
  Gaúcho: {
    nomeEstadual: 'Campeonato Gaúcho',
    adversarios: ordenar([
      'Aimoré', 'Caxias', 'Grêmio', 'Internacional', 'Juventude',
      'Novo Hamburgo', 'São José-PA', 'Ypiranga-ER', 'Brasil de Pelotas', 'Avenida',
    ]),
    estadios: ['Arena do Grêmio', 'Beira-Rio', 'Alfredo Jaconi', 'Centenário', 'Estádio do Vale'],
  },
  Paulista: {
    nomeEstadual: 'Campeonato Paulista',
    adversarios: ordenar([
      'Corinthians', 'Palmeiras', 'São Paulo', 'Santos', 'RB Bragantino',
      'Novorizontino', 'Água Santa', 'Mirassol', 'Guarani', 'Ponte Preta', 'São Bernardo',
    ]),
    estadios: ['Allianz Parque', 'Neo Química Arena', 'MorumBIS', 'Vila Belmiro', 'Brinco de Ouro'],
  },
  Nacional: {
    adversarios: ordenar([
      'Athletico-PR', 'Atlético-GO', 'Atlético-MG', 'Bahia', 'Botafogo',
      'Corinthians', 'Criciúma', 'Cruzeiro', 'Cuiabá', 'Flamengo',
      'Fluminense', 'Fortaleza', 'Grêmio', 'Internacional', 'Juventude',
      'Palmeiras', 'RB Bragantino', 'São Paulo', 'Vasco', 'Vitória',
    ]),
    estadios: [
      'Maracanã', 'São Januário', 'Nilton Santos (Engenhão)', 'Mineirão', 'Arena MRV',
      'Allianz Parque', 'Neo Química Arena', 'MorumBIS', 'Beira-Rio', 'Arena do Grêmio',
      'Fonte Nova', 'Castelão', 'Mané Garrincha', 'Kleber Andrade',
    ],
  },
  Internacional: {
    adversarios: ordenar([
      'River Plate', 'Boca Juniors', 'Peñarol', 'Nacional-URU', 'Colo-Colo',
      'Olimpia', 'LDU', 'Independiente del Valle', 'Racing', 'Estudiantes',
      'Bolívar', 'Palmeiras', 'Atlético-MG', 'São Paulo', 'Botafogo', 'Flamengo',
    ]),
    estadios: [
      'Maracanã', 'Monumental de Núñez', 'La Bombonera', 'Campeón del Siglo',
      'Defensores del Chaco', 'Casa Blanca', 'Atanasio Girardot', 'Allianz Parque', 'Mineirão',
    ],
  },
}

const getOpcoesPorCampeonato = (campeonato, timeUsuario) => {
  if (campeonato === 'Estadual') {
    if (['Flamengo', 'Vasco', 'Fluminense', 'Botafogo'].includes(timeUsuario)) return DADOS_COMPETICAO.Carioca
    if (['Grêmio', 'Internacional'].includes(timeUsuario)) return DADOS_COMPETICAO.Gaúcho
    if (['Corinthians', 'Palmeiras', 'São Paulo', 'Santos'].includes(timeUsuario)) return DADOS_COMPETICAO.Paulista
    return DADOS_COMPETICAO.Carioca
  }
  if (campeonato === 'Libertadores' || campeonato === 'Sul-Americana') return DADOS_COMPETICAO.Internacional
  return DADOS_COMPETICAO.Nacional
}

const rotuloCampeonato = (campeonato, timeUsuario) =>
  campeonato === 'Estadual' ? getOpcoesPorCampeonato('Estadual', timeUsuario).nomeEstadual : campeonato

const criarRascunho = (timeUsuario) => ({
  adversario: '',
  campeonato: 'Brasileirão',
  data: '',
  estadio: getOpcoesPorCampeonato('Brasileirão', timeUsuario).estadios[0],
  status: STATUS_AGUARDANDO,
  valorIngresso: '',
})

/* ================================================================== */
/* Estilos reutilizados                                                 */
/* ================================================================== */

const SOMBRA_CARTAO =
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_-2px_rgba(15,23,42,0.05)]'
const SOMBRA_CARTAO_HOVER =
  'hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_28px_-10px_rgba(15,23,42,0.12)]'

const BTN_PRIMARIO =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15 disabled:cursor-not-allowed disabled:opacity-60'
const BTN_SECUNDARIO =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10'
const BTN_FANTASMA =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10'

const CAMPO =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5'
const ROTULO_CAMPO = 'mb-1.5 block text-xs font-medium text-slate-600'
const ROTULO_SECAO = 'text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500'

/* ================================================================== */
/* Icones (SVG inline)                                                  */
/* ================================================================== */

const IconeChevron = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconeMais = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
  </svg>
)

const IconeFechar = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeLinecap="round" />
  </svg>
)

const IconeAssistente = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path
      d="M4 5.5A2.5 2.5 0 016.5 3h7A2.5 2.5 0 0116 5.5v5a2.5 2.5 0 01-2.5 2.5H9l-3.5 3v-3H6.5A2.5 2.5 0 014 10.5v-5z"
      strokeLinejoin="round"
    />
    <path d="M7.5 7.25h5M7.5 9.75h3" strokeLinecap="round" />
  </svg>
)

/* ================================================================== */
/* Componentes de apoio                                                 */
/* ================================================================== */

function SelectEstilizado({ id, value, onChange, children, ariaLabel, name, altura = 'h-9', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        name={name}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        className={`${altura} w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5`}
      >
        {children}
      </select>
      <IconeChevron className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

function Modal({ titulo, descricao, onFechar, children, largura = 'max-w-lg' }) {
  const fecharRef = useRef(onFechar)

  useEffect(() => {
    fecharRef.current = onFechar
  })

  useEffect(() => {
    const aoTeclar = (event) => {
      if (event.key === 'Escape') fecharRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onFechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`w-full ${largura} rounded-2xl bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{titulo}</h2>
            {descricao ? <p className="mt-1 text-sm text-slate-500">{descricao}</p> : null}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconeFechar className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AlertaErro({ mensagem, onFechar }) {
  if (!mensagem) return null
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
    >
      <span>{mensagem}</span>
      {onFechar ? (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Dispensar"
          className="shrink-0 text-rose-400 transition hover:text-rose-700"
        >
          <IconeFechar className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

function CampoValor({ id, value, onChange, placeholder = '0,00', autoFocus = false }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${CAMPO} pl-10 tabular-nums`}
      />
    </div>
  )
}

/* ================================================================== */
/* Bloco analitico com rosca SVG proporcional e interativa              */
/* ================================================================== */

const MAX_PILULAS = 4
const RAIO = 48
const ESPESSURA = 11
const ESPESSURA_ATIVA = 15

function BlocoAnalitico({
  rotulo,
  valor,
  unidade,
  detalhe,
  fatias,
  formatarValor,
  centroValor,
  centroRotulo,
  textoVazio,
}) {
  const [ativo, setAtivo] = useState(null)

  const segmentos = useMemo(() => {
    const validas = fatias.filter((f) => f.valor > 0)
    const total = validas.reduce((acc, f) => acc + f.valor, 0)
    let acumulado = 0
    return validas.map((fatia, index) => {
      const proporcao = total > 0 ? fatia.valor / total : 0
      const segmento = {
        ...fatia,
        proporcao,
        inicio: acumulado,
        cor: CORES_GRAFICO[index % CORES_GRAFICO.length],
      }
      acumulado += proporcao
      return segmento
    })
  }, [fatias])

  const fatiaAtiva = ativo !== null ? segmentos[ativo] || null : null
  const espaco = segmentos.length > 1 ? 0.8 : 0
  const visiveis = segmentos.slice(0, MAX_PILULAS)
  const ocultas = segmentos.slice(MAX_PILULAS)

  return (
    <section
      className={`flex flex-col rounded-2xl border border-slate-200/70 bg-white p-6 transition-shadow duration-300 ${SOMBRA_CARTAO} ${SOMBRA_CARTAO_HOVER}`}
    >
      <p className={ROTULO_SECAO}>{rotulo}</p>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
          {valor}
        </span>
        {unidade ? <span className="text-sm font-medium text-slate-400">{unidade}</span> : null}
      </div>
      <p className="mt-2 truncate text-xs text-slate-500" title={detalhe}>
        {detalhe}
      </p>

      <div className="mt-6 flex justify-center">
        <div className="relative h-40 w-40" onMouseLeave={() => setAtivo(null)}>
          <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible" role="img" aria-label={rotulo}>
            <circle cx="60" cy="60" r={RAIO} fill="none" stroke="#f1f5f9" strokeWidth={ESPESSURA} />
            <g transform="rotate(-90 60 60)">
              {segmentos.map((seg, i) => {
                const comprimento = Math.max(seg.proporcao * 100 - espaco, 0.4)
                const destacado = ativo === i
                return (
                  <circle
                    key={seg.rotulo}
                    cx="60"
                    cy="60"
                    r={RAIO}
                    fill="none"
                    stroke={seg.cor}
                    pathLength="100"
                    strokeDasharray={`${comprimento} ${100 - comprimento}`}
                    strokeDashoffset={-(seg.inicio * 100 + espaco / 2)}
                    tabIndex={0}
                    aria-label={`${seg.rotulo}: ${formatarValor(seg.valor)}`}
                    className="cursor-pointer outline-none"
                    style={{
                      strokeWidth: destacado ? ESPESSURA_ATIVA : ESPESSURA,
                      opacity: ativo === null || destacado ? 1 : 0.25,
                      transition: 'stroke-width 200ms ease-out, opacity 200ms ease-out',
                    }}
                    onMouseEnter={() => setAtivo(i)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                  />
                )
              })}
            </g>
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            {fatiaAtiva ? (
              <>
                <span className="text-[15px] font-semibold leading-tight text-slate-900 tabular-nums">
                  {formatarValor(fatiaAtiva.valor)}
                </span>
                <span className="mt-1 w-full truncate text-[11px] font-medium text-slate-500">
                  {fatiaAtiva.rotulo}
                </span>
                <span className="mt-0.5 text-[11px] font-semibold tabular-nums" style={{ color: fatiaAtiva.cor }}>
                  {(fatiaAtiva.proporcao * 100).toFixed(fatiaAtiva.proporcao < 0.1 ? 1 : 0)}%
                </span>
              </>
            ) : segmentos.length === 0 ? (
              <span className="text-xs text-slate-400">Sem dados</span>
            ) : (
              <>
                <span className="text-2xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
                  {centroValor}
                </span>
                <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  {centroRotulo}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex min-h-[3.25rem] flex-wrap content-start justify-center gap-1.5">
        {segmentos.length === 0 ? (
          <span className="text-xs text-slate-400">{textoVazio}</span>
        ) : (
          <>
            {visiveis.map((seg, i) => (
              <span
                key={seg.rotulo}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                className={`inline-flex max-w-[9rem] cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-200 ${
                  ativo === i
                    ? 'border-slate-300 bg-white text-slate-900'
                    : 'border-slate-200/80 bg-slate-50 text-slate-600'
                }`}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: seg.cor }} />
                <span className="truncate">{seg.rotulo}</span>
              </span>
            ))}
            {ocultas.length > 0 ? (
              <span
                title={ocultas.map((s) => `${s.rotulo}: ${formatarValor(s.valor)}`).join('\n')}
                className="inline-flex cursor-default items-center rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500"
              >
                +{ocultas.length}
              </span>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

/* ================================================================== */
/* Cartao de partida                                                    */
/* ================================================================== */

function SeloStatus({ comprado }) {
  return comprado ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Comprado
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Aguardando venda
    </span>
  )
}

function CartaoPartida({ jogo, time, onComprar, onExcluir }) {
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const data = parseDataJogo(jogo.data)
  const dias = diasAteJogo(jogo.data)
  const comprado = jogo.status === STATUS_COMPRADO
  const valor = Number(jogo.valorIngresso || 0)
  const realizado = dias !== null && dias < 0
  const tempo = realizado ? 'Realizado' : descreverDistancia(dias)

  const rotuloValor = comprado ? 'Valor pago' : valor > 0 ? 'Valor previsto' : 'Valor'
  const textoValor = comprado || valor > 0 ? formatCurrency(valor) : 'A definir'

  const confirmarExclusao = async () => {
    setExcluindo(true)
    const ok = await onExcluir(jogo.id)
    if (!ok) {
      setExcluindo(false)
      setConfirmando(false)
    }
  }

  return (
    <article
      className={`flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 transition-shadow duration-300 ${SOMBRA_CARTAO} ${SOMBRA_CARTAO_HOVER}`}
    >
      <div className="flex gap-4">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200/70 bg-slate-50 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {data ? MESES_ABREVIADOS[Number(data.mes) - 1] : '--'}
          </span>
          <span className="text-xl font-semibold leading-tight text-slate-900 tabular-nums">
            {data ? data.dia : '--'}
          </span>
          <span className="text-[10px] text-slate-400 tabular-nums">{data ? data.ano : ''}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate pt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
              {jogo.campeonato || 'Campeonato'}
            </p>
            <SeloStatus comprado={comprado} />
          </div>
          <h3 className="mt-1.5 truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {time || jogo.clube || 'Meu time'} <span className="font-normal text-slate-400">x</span>{' '}
            {jogo.adversario}
          </h3>
          <p className="mt-0.5 truncate text-sm text-slate-500">{jogo.estadio}</p>
          <p className="mt-1 text-xs text-slate-400">
            {diaDaSemana(jogo.data)}
            {tempo ? ` · ${tempo}` : ''}
          </p>
        </div>
      </div>

      {/* Rodape: valor e exclusao numa linha; acao principal em linha propria, largura total */}
      <div className="mt-auto pt-5">
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">{rotuloValor}</p>
              <p
                className={`truncate text-sm font-semibold tabular-nums ${
                  comprado || valor > 0 ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {textoValor}
              </p>
            </div>

            {!confirmando ? (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                Excluir
              </button>
            ) : null}
          </div>

          {confirmando ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-xs leading-relaxed text-rose-700">
                Excluir esta partida? A ação não pode ser desfeita.
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={excluindo}
                  className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarExclusao}
                  disabled={excluindo}
                  className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-lg bg-rose-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-60"
                >
                  {excluindo ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          ) : !comprado ? (
            <button
              type="button"
              onClick={() => onComprar(jogo)}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <path d="M5 10.5l3.2 3.2L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Marcar como comprado
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/* ================================================================== */
/* Pagina                                                               */
/* ================================================================== */

const FILTROS_STATUS = [
  { valor: 'todas', nome: 'Todas' },
  { valor: 'compradas', nome: 'Compradas' },
  { valor: 'aguardando', nome: 'Aguardando' },
]

export default function DashboardPage() {
  const { user, profile, logout, atualizarNome } = useAuth()
  const navigate = useNavigate()
  const timeUsuario = profile?.time || ''

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const [games, setGames] = useState([])
  const [erroPagina, setErroPagina] = useState('')

  const hoje = new Date()
  const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0')
  const anoAtual = String(hoje.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(mesAtual)
  const [selectedYear, setSelectedYear] = useState(anoAtual)
  const [filtroStatus, setFiltroStatus] = useState('todas')

  const [assistenteAberto, setAssistenteAberto] = useState(false)

  // Modal de novo jogo
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [draft, setDraft] = useState(() => criarRascunho(''))
  const [erroCriacao, setErroCriacao] = useState('')
  const [loadingGame, setLoadingGame] = useState(false)
  const [isAdversarioOpen, setIsAdversarioOpen] = useState(false)
  const [searchAdversario, setSearchAdversario] = useState('')
  const adversarioDropdownRef = useRef(null)

  // Modal de compra
  const [purchaseTarget, setPurchaseTarget] = useState(null)
  const [purchaseValue, setPurchaseValue] = useState('')
  const [erroCompra, setErroCompra] = useState('')
  const [salvandoCompra, setSalvandoCompra] = useState(false)

  // Modal de nome
  const [nomeModalOpen, setNomeModalOpen] = useState(false)
  const [nomeRascunho, setNomeRascunho] = useState('')
  const [erroNome, setErroNome] = useState('')
  const [salvandoNome, setSalvandoNome] = useState(false)

  // Nome real do torcedor: campo "nome" do documento users/{uid}
  const nomeTorcedor = limparTexto(profile?.nome) || limparTexto(user?.displayName)
  const corTime = COR_TIME[timeUsuario] || '#334155'

  useEffect(() => {
    if (!user) return undefined

    const q = query(collection(db, 'jogos'), where('userId', '==', user.uid))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setGames(snapshot.docs.map((docSnap) => normalizarJogo({ id: docSnap.id, ...docSnap.data() })))
      },
      (snapshotError) => {
        console.error(snapshotError)
        setErroPagina('Não foi possível carregar os seus jogos.')
      },
    )

    return unsubscribe
  }, [user])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (adversarioDropdownRef.current && !adversarioDropdownRef.current.contains(event.target)) {
        setIsAdversarioOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const anosDisponiveis = useMemo(() => {
    const anos = new Set([anoAtual, String(Number(anoAtual) + 1), selectedYear])
    games.forEach((g) => {
      const ano = parseDataJogo(g.data)?.ano
      if (ano) anos.add(ano)
    })
    return Array.from(anos).sort((a, b) => Number(b) - Number(a))
  }, [games, selectedYear, anoAtual])

  const stats = useMemo(
    () => calcularEstatisticas(games, selectedYear, selectedMonth),
    [games, selectedYear, selectedMonth],
  )

  // Lista de partidas: filtro ESTRITO pelo periodo selecionado
  const jogosPeriodo = useMemo(
    () => jogosDoPeriodo(games, selectedYear, selectedMonth),
    [games, selectedYear, selectedMonth],
  )

  const contagemStatus = useMemo(() => {
    const compradas = jogosPeriodo.filter((g) => g.status === STATUS_COMPRADO).length
    return { todas: jogosPeriodo.length, compradas, aguardando: jogosPeriodo.length - compradas }
  }, [jogosPeriodo])

  const listaExibida = useMemo(() => {
    const filtrados = jogosPeriodo.filter((g) => {
      if (filtroStatus === 'compradas') return g.status === STATUS_COMPRADO
      if (filtroStatus === 'aguardando') return g.status !== STATUS_COMPRADO
      return true
    })
    return ordenarAgenda(filtrados)
  }, [jogosPeriodo, filtroStatus])

  const periodoAtualSelecionado = selectedMonth === mesAtual && selectedYear === anoAtual
  const nomeMes = OPCOES_MES.find((m) => m.valor === selectedMonth)?.nome || ''
  const visaoAnual = selectedMonth === 'todos'

  /* ------------------------- Novo jogo ------------------------- */

  const abrirNovoJogo = () => {
    setDraft(criarRascunho(timeUsuario))
    setErroCriacao('')
    setSearchAdversario('')
    setIsAdversarioOpen(false)
    setCreateModalOpen(true)
  }

  const fecharNovoJogo = () => {
    if (loadingGame) return
    setCreateModalOpen(false)
    setIsAdversarioOpen(false)
  }

  const handleDraftChange = (event) => {
    const { name, value } = event.target
    setDraft((current) => {
      const updated = { ...current, [name]: value }
      if (name === 'campeonato') {
        const opcoes = getOpcoesPorCampeonato(value, timeUsuario)
        updated.adversario = ''
        if (!opcoes.estadios.includes(current.estadio)) updated.estadio = opcoes.estadios[0]
      }
      return updated
    })
  }

  const handleCreateGame = async (event) => {
    event.preventDefault()
    setErroCriacao('')

    const opcoes = getOpcoesPorCampeonato(draft.campeonato, timeUsuario)

    if (!draft.adversario) {
      setErroCriacao('Selecione o adversário.')
      return
    }
    if (!opcoes.adversarios.includes(draft.adversario)) {
      setErroCriacao('Selecione um adversário válido da lista oficial.')
      return
    }
    const dataValida = parseDataJogo(draft.data)
    if (!dataValida) {
      setErroCriacao('Informe a data da partida.')
      return
    }
    if (!opcoes.estadios.includes(draft.estadio)) {
      setErroCriacao('Selecione um estádio válido.')
      return
    }
    const valor = parseCurrency(draft.valorIngresso)
    if (Number.isNaN(valor) || valor < 0) {
      setErroCriacao('Informe um valor de ingresso válido. Exemplo: 80,00')
      return
    }

    setLoadingGame(true)
    try {
      await addDoc(collection(db, 'jogos'), {
        userId: user.uid,
        clube: timeUsuario || 'Meu Time',
        adversario: draft.adversario,
        campeonato: rotuloCampeonato(draft.campeonato, timeUsuario),
        data: draft.data,
        estadio: draft.estadio,
        status: draft.status === STATUS_COMPRADO ? STATUS_COMPRADO : STATUS_AGUARDANDO,
        valorIngresso: Math.round(valor * 100) / 100,
        createdAt: serverTimestamp(),
      })

      setSelectedYear(dataValida.ano)
      setSelectedMonth(dataValida.mes)
      setFiltroStatus('todas')
      setCreateModalOpen(false)
    } catch (submitError) {
      console.error(submitError)
      setErroCriacao('Não foi possível cadastrar o jogo. Tente novamente.')
    } finally {
      setLoadingGame(false)
    }
  }

  /* ------------------------- Compra ------------------------- */

  const abrirCompra = (jogo) => {
    setPurchaseTarget(jogo)
    const valor = Number(jogo.valorIngresso || 0)
    setPurchaseValue(valor > 0 ? valor.toFixed(2).replace('.', ',') : '')
    setErroCompra('')
  }

  const fecharCompra = () => {
    if (salvandoCompra) return
    setPurchaseTarget(null)
    setPurchaseValue('')
    setErroCompra('')
  }

  const handlePurchaseSubmit = async (event) => {
    event.preventDefault()
    if (!purchaseTarget) return

    const amount = parseCurrency(purchaseValue)
    if (Number.isNaN(amount) || amount < 0) {
      setErroCompra('Informe um valor válido. Exemplo: 120,00')
      return
    }

    setSalvandoCompra(true)
    try {
      await updateDoc(doc(db, 'jogos', purchaseTarget.id), {
        status: STATUS_COMPRADO,
        valorIngresso: Math.round(amount * 100) / 100,
      })
      setPurchaseTarget(null)
      setPurchaseValue('')
    } catch (submitError) {
      console.error(submitError)
      setErroCompra('Não foi possível atualizar o ingresso. Tente novamente.')
    } finally {
      setSalvandoCompra(false)
    }
  }

  /* ------------------------- Exclusao ------------------------- */

  const handleDeleteGame = async (gameId) => {
    try {
      await deleteDoc(doc(db, 'jogos', gameId))
      return true
    } catch (deleteError) {
      console.error(deleteError)
      setErroPagina('Não foi possível excluir este jogo.')
      return false
    }
  }

  /* ------------------------- Nome ------------------------- */

  const abrirNome = () => {
    setNomeRascunho(nomeTorcedor)
    setErroNome('')
    setNomeModalOpen(true)
  }

  const handleSalvarNome = async (event) => {
    event.preventDefault()
    setErroNome('')
    setSalvandoNome(true)
    try {
      await atualizarNome(nomeRascunho)
      setNomeModalOpen(false)
    } catch (nomeError) {
      console.error(nomeError)
      setErroNome(nomeError?.message || 'Não foi possível salvar o nome.')
    } finally {
      setSalvandoNome(false)
    }
  }

  /* ------------------------- Derivados do formulario ------------------------- */

  const opcoesAtuais = getOpcoesPorCampeonato(draft.campeonato, timeUsuario)
  const adversariosFiltrados = opcoesAtuais.adversarios
    .filter((clube) => clube !== timeUsuario)
    .filter((clube) => clube.toLowerCase().includes(searchAdversario.toLowerCase()))

  const fatiasCampeonatos = stats.frequenciaCampeonatos
  const formatarVezes = (n) => plural(n, 'jogo', 'jogos')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ------------------------------ Cabecalho ------------------------------ */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="h-[3px] w-full" style={{ backgroundColor: corTime }} />
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-semibold tracking-wide text-white">
              DA
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-slate-900 sm:inline">
              Diário de Arquibancada
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right">
              {nomeTorcedor ? (
                <p className="max-w-[11rem] truncate text-sm font-medium text-slate-900 sm:max-w-[18rem]">
                  {nomeTorcedor}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={abrirNome}
                  className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
                >
                  Adicionar o seu nome
                </button>
              )}
              {timeUsuario ? (
                <p className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: corTime }} />
                  {timeUsuario}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={abrirNome}
              title="Editar nome"
              aria-label="Editar nome"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
            >
              {iniciais(nomeTorcedor) || (
                <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <circle cx="10" cy="7" r="3" />
                  <path d="M4 16c1.2-2.6 3.4-4 6-4s4.8 1.4 6 4" strokeLinecap="round" />
                </svg>
              )}
            </button>

            <span className="hidden h-6 w-px bg-slate-200 sm:block" />

            <button type="button" onClick={handleLogout} className={BTN_FANTASMA}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        {/* ------------------------------ Visao geral ------------------------------ */}
        <section aria-labelledby="titulo-visao-geral">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={ROTULO_SECAO}>Visão geral</p>
              <h1
                id="titulo-visao-geral"
                className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]"
              >
                Resumo de arquibancada
              </h1>
              <p className="mt-1 text-sm text-slate-500">{stats.rotuloPeriodo}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!periodoAtualSelecionado ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth(mesAtual)
                    setSelectedYear(anoAtual)
                  }}
                  className={BTN_FANTASMA}
                >
                  Mês atual
                </button>
              ) : null}
              <SelectEstilizado
                ariaLabel="Mês"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-44"
              >
                {OPCOES_MES.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.nome}
                  </option>
                ))}
              </SelectEstilizado>
              <SelectEstilizado
                ariaLabel="Ano"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-28"
              >
                {anosDisponiveis.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </SelectEstilizado>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <BlocoAnalitico
              rotulo={visaoAnual ? 'Gasto no período' : 'Gasto no mês'}
              valor={formatCurrency(stats.gastoPeriodo)}
              detalhe={`${visaoAnual ? `Ano de ${selectedYear}` : nomeMes} · ${plural(
                stats.ingressosPeriodo,
                'ingresso',
                'ingressos',
              )}${stats.ingressosPeriodo > 0 ? ` · média ${formatCurrency(stats.ticketMedioPeriodo)}` : ''}`}
              fatias={stats.gastoPorCampPeriodo}
              formatarValor={formatCurrency}
              centroValor={stats.ingressosPeriodo}
              centroRotulo={stats.ingressosPeriodo === 1 ? 'ingresso' : 'ingressos'}
              textoVazio="Nenhum gasto no período"
            />

            <BlocoAnalitico
              rotulo="Gasto anual"
              valor={formatCurrency(stats.gastoAno)}
              detalhe={`${selectedYear} · ${plural(stats.ingressosAno, 'ingresso', 'ingressos')}${
                stats.ingressosAno > 0 ? ` · média ${formatCurrency(stats.ticketMedioAno)}` : ''
              }`}
              fatias={stats.gastoPorCampAno}
              formatarValor={formatCurrency}
              centroValor={stats.ingressosAno}
              centroRotulo={stats.ingressosAno === 1 ? 'ingresso' : 'ingressos'}
              textoVazio="Nenhum gasto no ano"
            />

            <BlocoAnalitico
              rotulo="Campeonatos"
              valor={stats.jogosCompradosAno}
              unidade={stats.jogosCompradosAno === 1 ? 'jogo' : 'jogos'}
              detalhe={`${selectedYear} · ${plural(stats.jogosRealizadosAno, 'realizado', 'realizados')} · ${
                stats.jogosFuturosAno
              } por vir`}
              fatias={fatiasCampeonatos}
              formatarValor={formatarVezes}
              centroValor={stats.campeonatosDistintos}
              centroRotulo={stats.campeonatosDistintos === 1 ? 'campeonato' : 'campeonatos'}
              textoVazio="Nenhum ingresso comprado no ano"
            />

            <BlocoAnalitico
              rotulo="Estádios visitados"
              valor={stats.estadiosDistintos}
              unidade={stats.estadiosDistintos === 1 ? 'estádio' : 'estádios'}
              detalhe={
                stats.estadioMaisVisitado
                  ? `Mais visitado: ${stats.estadioMaisVisitado.rotulo} (${stats.estadioMaisVisitado.valor}x)`
                  : `Nenhuma visita registrada em ${selectedYear}`
              }
              fatias={stats.frequenciaEstadios}
              formatarValor={(n) => plural(n, 'visita', 'visitas')}
              centroValor={stats.jogosRealizadosAno}
              centroRotulo={stats.jogosRealizadosAno === 1 ? 'presença' : 'presenças'}
              textoVazio="Nenhum jogo realizado no ano"
            />
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Gastos consideram apenas ingressos comprados. Estádios visitados consideram jogos comprados com data já
            passada.
          </p>
        </section>

        {/* ------------------------------ Partidas ------------------------------ */}
        <section aria-labelledby="titulo-partidas" className="mt-14">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={ROTULO_SECAO}>Partidas</p>
              <h2 id="titulo-partidas" className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">
                {stats.rotuloPeriodo}
                <span className="ml-2 text-base font-normal text-slate-400 tabular-nums">{contagemStatus.todas}</span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Filtrar por situação" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                {FILTROS_STATUS.map((f) => {
                  const ativo = filtroStatus === f.valor
                  return (
                    <button
                      key={f.valor}
                      type="button"
                      role="tab"
                      aria-selected={ativo}
                      onClick={() => setFiltroStatus(f.valor)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                        ativo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {f.nome}
                      <span className={`tabular-nums ${ativo ? 'text-slate-400' : 'text-slate-400/80'}`}>
                        {contagemStatus[f.valor]}
                      </span>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => setAssistenteAberto((v) => !v)}
                aria-pressed={assistenteAberto}
                className={`${BTN_SECUNDARIO} ${assistenteAberto ? 'border-slate-300 bg-slate-50 text-slate-900' : ''}`}
              >
                <IconeAssistente className="h-4 w-4" />
                Assistente
              </button>

              <button type="button" onClick={abrirNovoJogo} className={BTN_PRIMARIO}>
                <IconeMais className="h-4 w-4" />
                Novo jogo
              </button>
            </div>
          </div>

          {erroPagina ? (
            <div className="mt-5">
              <AlertaErro mensagem={erroPagina} onFechar={() => setErroPagina('')} />
            </div>
          ) : null}

          {listaExibida.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-900">
                {contagemStatus.todas === 0
                  ? 'Nenhuma partida neste período'
                  : 'Nenhuma partida com esta situação'}
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                {contagemStatus.todas === 0
                  ? 'Altere o mês ou o ano acima, ou registre uma nova partida.'
                  : 'Escolha outra situação no filtro para ver as demais partidas do período.'}
              </p>
              {contagemStatus.todas === 0 ? (
                <button type="button" onClick={abrirNovoJogo} className={`${BTN_SECUNDARIO} mt-5`}>
                  <IconeMais className="h-4 w-4" />
                  Novo jogo
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {listaExibida.map((jogo) => (
                <CartaoPartida
                  key={jogo.id}
                  jogo={jogo}
                  time={timeUsuario}
                  onComprar={abrirCompra}
                  onExcluir={handleDeleteGame}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ------------------------------ Modal: novo jogo ------------------------------ */}
      {createModalOpen ? (
        <Modal
          titulo="Novo jogo"
          descricao="Registre uma partida para acompanhar ingresso, gastos e presença."
          onFechar={fecharNovoJogo}
        >
          <form onSubmit={handleCreateGame} noValidate>
            <div className="space-y-4 px-6 py-5">
              {erroCriacao ? <AlertaErro mensagem={erroCriacao} /> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="campo-campeonato" className={ROTULO_CAMPO}>
                    Campeonato
                  </label>
                  <SelectEstilizado
                    id="campo-campeonato"
                    name="campeonato"
                    value={draft.campeonato}
                    onChange={handleDraftChange}
                    altura="h-10"
                    ariaLabel="Campeonato"
                  >
                    {OPCOES_CAMPEONATO.map((camp) => (
                      <option key={camp} value={camp}>
                        {rotuloCampeonato(camp, timeUsuario)}
                      </option>
                    ))}
                  </SelectEstilizado>
                </div>

                <div className="relative" ref={adversarioDropdownRef}>
                  <span className={ROTULO_CAMPO}>Adversário</span>
                  <button
                    type="button"
                    onClick={() => setIsAdversarioOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={isAdversarioOpen}
                    className={`${CAMPO} flex items-center justify-between text-left`}
                  >
                    <span className={`truncate ${draft.adversario ? 'text-slate-900' : 'text-slate-400'}`}>
                      {draft.adversario || 'Selecione o clube'}
                    </span>
                    <IconeChevron
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                        isAdversarioOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isAdversarioOpen ? (
                    <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.25)]">
                      <input
                        type="text"
                        autoFocus
                        value={searchAdversario}
                        onChange={(e) => setSearchAdversario(e.target.value)}
                        placeholder="Pesquisar adversário"
                        className="mb-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                      />
                      <div role="listbox" className="max-h-52 overflow-y-auto [scrollbar-width:thin]">
                        {adversariosFiltrados.length === 0 ? (
                          <p className="py-3 text-center text-sm text-slate-400">Nenhum clube encontrado</p>
                        ) : (
                          adversariosFiltrados.map((clube) => (
                            <button
                              key={clube}
                              type="button"
                              role="option"
                              aria-selected={draft.adversario === clube}
                              onClick={() => {
                                setDraft((prev) => ({ ...prev, adversario: clube }))
                                setIsAdversarioOpen(false)
                                setSearchAdversario('')
                              }}
                              className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition ${
                                draft.adversario === clube
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="campo-data" className={ROTULO_CAMPO}>
                    Data da partida
                  </label>
                  <input
                    id="campo-data"
                    type="date"
                    name="data"
                    value={draft.data}
                    onChange={handleDraftChange}
                    required
                    className={`${CAMPO} tabular-nums`}
                  />
                </div>

                <div>
                  <label htmlFor="campo-estadio" className={ROTULO_CAMPO}>
                    Estádio
                  </label>
                  <SelectEstilizado
                    id="campo-estadio"
                    name="estadio"
                    value={draft.estadio}
                    onChange={handleDraftChange}
                    altura="h-10"
                    ariaLabel="Estádio"
                  >
                    {opcoesAtuais.estadios.map((est) => (
                      <option key={est} value={est}>
                        {est}
                      </option>
                    ))}
                  </SelectEstilizado>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={ROTULO_CAMPO}>Situação do ingresso</span>
                  <div className="grid h-10 grid-cols-2 rounded-lg bg-slate-100 p-0.5">
                    {[
                      { valor: STATUS_AGUARDANDO, nome: 'Aguardando' },
                      { valor: STATUS_COMPRADO, nome: 'Comprado' },
                    ].map((opcao) => {
                      const ativo = draft.status === opcao.valor
                      return (
                        <button
                          key={opcao.valor}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => setDraft((prev) => ({ ...prev, status: opcao.valor }))}
                          className={`rounded-md text-sm font-medium transition ${
                            ativo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {opcao.nome}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="campo-valor" className={ROTULO_CAMPO}>
                    {draft.status === STATUS_COMPRADO ? 'Valor pago' : 'Valor previsto (opcional)'}
                  </label>
                  <CampoValor
                    id="campo-valor"
                    value={draft.valorIngresso}
                    onChange={(e) => setDraft((prev) => ({ ...prev, valorIngresso: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button type="button" onClick={fecharNovoJogo} className={BTN_SECUNDARIO}>
                Cancelar
              </button>
              <button type="submit" disabled={loadingGame} className={BTN_PRIMARIO}>
                {loadingGame ? 'Salvando...' : 'Salvar jogo'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ------------------------------ Modal: compra ------------------------------ */}
      {purchaseTarget ? (
        <Modal
          titulo="Marcar como comprado"
          descricao={`${timeUsuario || 'Meu time'} x ${purchaseTarget.adversario} · ${formatarDataBr(
            purchaseTarget.data,
          )}`}
          onFechar={fecharCompra}
          largura="max-w-md"
        >
          <form onSubmit={handlePurchaseSubmit} noValidate>
            <div className="space-y-4 px-6 py-5">
              {erroCompra ? <AlertaErro mensagem={erroCompra} /> : null}
              <div>
                <label htmlFor="campo-valor-compra" className={ROTULO_CAMPO}>
                  Valor pago no ingresso
                </label>
                <CampoValor
                  id="campo-valor-compra"
                  value={purchaseValue}
                  onChange={(e) => setPurchaseValue(e.target.value)}
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  O valor passa a contar nos gastos do mês e do ano da partida.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button type="button" onClick={fecharCompra} className={BTN_SECUNDARIO}>
                Cancelar
              </button>
              <button type="submit" disabled={salvandoCompra} className={BTN_PRIMARIO}>
                {salvandoCompra ? 'Salvando...' : 'Confirmar compra'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ------------------------------ Modal: nome ------------------------------ */}
      {nomeModalOpen ? (
        <Modal
          titulo={nomeTorcedor ? 'Editar nome' : 'Adicionar o seu nome'}
          descricao="Este é o nome exibido no topo do painel."
          onFechar={() => !salvandoNome && setNomeModalOpen(false)}
          largura="max-w-md"
        >
          <form onSubmit={handleSalvarNome} noValidate>
            <div className="space-y-4 px-6 py-5">
              {erroNome ? <AlertaErro mensagem={erroNome} /> : null}
              <div>
                <label htmlFor="campo-nome" className={ROTULO_CAMPO}>
                  Nome completo
                </label>
                <input
                  id="campo-nome"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  value={nomeRascunho}
                  onChange={(e) => setNomeRascunho(e.target.value)}
                  placeholder="Ex.: Débora Gomes"
                  className={CAMPO}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button type="button" onClick={() => setNomeModalOpen(false)} className={BTN_SECUNDARIO}>
                Cancelar
              </button>
              <button type="submit" disabled={salvandoNome} className={BTN_PRIMARIO}>
                {salvandoNome ? 'Salvando...' : 'Salvar nome'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ------------------------------ Assistente ------------------------------ */}
      <AssistenteArquibancada
        aberto={assistenteAberto}
        onFechar={() => setAssistenteAberto(false)}
        games={games}
        stats={stats}
        nome={nomeTorcedor}
        time={timeUsuario}
      />
    </div>
  )
}
