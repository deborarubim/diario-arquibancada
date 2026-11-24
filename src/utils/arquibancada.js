/*
  Utilitarios partilhados entre o painel (DashboardPage) e o assistente
  (AssistenteArquibancada). Todos os calculos de dinheiro sao feitos em
  centavos inteiros para evitar erros de arredondamento de ponto flutuante.
*/

export const STATUS_COMPRADO = 'Comprado'
export const STATUS_AGUARDANDO = 'Aguardando Venda'

export const NOMES_MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export const MESES_ABREVIADOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export const OPCOES_MES = [
  { valor: 'todos', nome: 'Todos os meses' },
  ...NOMES_MESES.map((nome, i) => ({ valor: String(i + 1).padStart(2, '0'), nome })),
]

const DIA_MS = 86400000

/* ------------------------------ Texto ------------------------------ */

export const limparTexto = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim()

export const normalizarTexto = (valor) =>
  limparTexto(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`

export const iniciais = (nome) => {
  const partes = limparTexto(nome).split(' ').filter(Boolean)
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}

/* ------------------------------ Campeonatos ------------------------------ */

// Nomes alternativos que devem ser exibidos e agrupados com o nome oficial
const ALIASES_CAMPEONATO = {
  amigavel: 'Amistoso',
  amistoso: 'Amistoso',
  'jogo amistoso': 'Amistoso',
}

export const nomeCampeonato = (valor) => {
  const limpo = limparTexto(valor)
  return ALIASES_CAMPEONATO[normalizarTexto(limpo)] || limpo
}

// Padroniza um documento vindo do Firestore antes de qualquer calculo ou exibicao
export const normalizarJogo = (jogo) => ({
  ...jogo,
  campeonato: nomeCampeonato(jogo.campeonato),
})

/* ------------------------------ Dinheiro ------------------------------ */

const formatadorMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatCurrency = (valor) => formatadorMoeda.format(Number(valor || 0))

export const paraCentavos = (valor) => {
  const numero = Number(valor)
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0
}

export const somarValores = (lista) =>
  lista.reduce((acc, jogo) => acc + paraCentavos(jogo.valorIngresso), 0) / 100

/*
  Converte texto digitado em numero. Aceita "80", "80,50", "80.50",
  "1.250,00", "1,250.00", "R$ 1.500" e "1.500" (milhar no formato brasileiro).
  Retorna NaN quando o texto nao representa um valor valido.
*/
export const parseCurrency = (bruto) => {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : NaN
  let texto = String(bruto ?? '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
  if (!texto) return 0

  const temVirgula = texto.includes(',')
  const temPonto = texto.includes('.')

  if (temVirgula && temPonto) {
    if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.')
    } else {
      texto = texto.replace(/,/g, '')
    }
  } else if (temVirgula) {
    if ((texto.match(/,/g) || []).length > 1) return NaN
    texto = texto.replace(',', '.')
  } else if (temPonto) {
    const pontos = (texto.match(/\./g) || []).length
    if (pontos > 1 || /^\d{1,3}\.\d{3}$/.test(texto)) {
      texto = texto.replace(/\./g, '')
    }
  }

  if (!/^-?\d+(\.\d+)?$/.test(texto)) return NaN
  return Number(texto)
}

/* ------------------------------ Datas ------------------------------ */

/*
  Aceita AAAA-MM-DD (formato do input date), DD-MM-AAAA e DD/MM/AAAA.
  Retorna { ano, mes, dia, date } com mes e dia em dois digitos, ou null.
*/
export const parseDataJogo = (valor) => {
  if (!valor) return null
  const texto = String(valor).trim()
  let ano
  let mes
  let dia

  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    ;[, ano, mes, dia] = iso
  } else {
    const br = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
    if (!br) return null
    ;[, dia, mes, ano] = br
  }

  const a = Number(ano)
  const m = Number(mes)
  const d = Number(dia)
  const date = new Date(a, m - 1, d)
  if (date.getFullYear() !== a || date.getMonth() !== m - 1 || date.getDate() !== d) return null

  return {
    ano: String(a),
    mes: String(m).padStart(2, '0'),
    dia: String(d).padStart(2, '0'),
    date,
  }
}

// Diferenca em dias de calendario entre hoje e a data do jogo (negativo = ja passou)
export const diasAteJogo = (valorData, hoje = new Date()) => {
  const p = parseDataJogo(valorData)
  if (!p) return null
  const alvo = Date.UTC(Number(p.ano), Number(p.mes) - 1, Number(p.dia))
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((alvo - base) / DIA_MS)
}

// Um jogo so e considerado realizado a partir do dia seguinte a partida
export const jogoRealizado = (valorData, hoje = new Date()) => {
  const dias = diasAteJogo(valorData, hoje)
  return dias !== null && dias < 0
}

export const formatarDataBr = (valorData) => {
  const p = parseDataJogo(valorData)
  return p ? `${p.dia}/${p.mes}/${p.ano}` : String(valorData || '')
}

export const formatarDataExtenso = (valorData) => {
  const p = parseDataJogo(valorData)
  if (!p) return String(valorData || '')
  return p.date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export const diaDaSemana = (valorData) => {
  const p = parseDataJogo(valorData)
  if (!p) return ''
  const nome = p.date.toLocaleDateString('pt-BR', { weekday: 'long' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

export const descreverDistancia = (dias) => {
  if (dias === null || dias === undefined) return ''
  if (dias === 0) return 'Hoje'
  if (dias === 1) return 'Amanhã'
  if (dias === -1) return 'Ontem'
  if (dias > 1) return `Em ${dias} dias`
  return `Há ${Math.abs(dias)} dias`
}

export const rotuloPeriodo = (ano, mes) =>
  mes === 'todos' ? `Ano de ${ano}` : `${NOMES_MESES[Number(mes) - 1]} de ${ano}`

/* ------------------------------ Agregacoes ------------------------------ */

/*
  Agrupa jogos por um campo. modo 'gasto' soma valorIngresso (em centavos),
  modo 'contagem' conta ocorrencias. Rotulos que diferem apenas em
  maiusculas ou espacos sao tratados como o mesmo grupo.
  Retorna [{ rotulo, valor }] do maior para o menor, com desempate alfabetico.
*/
export const agruparJogos = (lista, chave, modo) => {
  const mapa = new Map()
  lista.forEach((jogo) => {
    const rotulo = limparTexto(jogo[chave]) || 'Não informado'
    const id = normalizarTexto(rotulo)
    const incremento = modo === 'gasto' ? paraCentavos(jogo.valorIngresso) : 1
    const atual = mapa.get(id)
    if (atual) atual.valor += incremento
    else mapa.set(id, { rotulo, valor: incremento })
  })

  return Array.from(mapa.values())
    .map((item) => ({
      rotulo: item.rotulo,
      valor: modo === 'gasto' ? item.valor / 100 : item.valor,
    }))
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

const media = (total, quantidade) =>
  quantidade > 0 ? Math.round((total * 100) / quantidade) / 100 : 0

export const jogosDoAno = (games, ano) =>
  games.filter((g) => parseDataJogo(g.data)?.ano === String(ano))

export const jogosDoPeriodo = (games, ano, mes) =>
  jogosDoAno(games, ano).filter((g) => mes === 'todos' || parseDataJogo(g.data)?.mes === mes)

/*
  Estatisticas do painel.
  - Gastos: apenas jogos com status Comprado.
  - Campeonatos: jogos com ingresso comprado no ano (realizados e por vir).
  - Estadios visitados: apenas jogos comprados cuja data ja passou.
*/
export const calcularEstatisticas = (games, ano, mes, hoje = new Date()) => {
  const doAno = jogosDoAno(games, ano)
  const doPeriodo = mes === 'todos' ? doAno : doAno.filter((g) => parseDataJogo(g.data)?.mes === mes)

  const compradosAno = doAno.filter((g) => g.status === STATUS_COMPRADO)
  const compradosPeriodo = doPeriodo.filter((g) => g.status === STATUS_COMPRADO)
  const realizadosAno = compradosAno.filter((g) => jogoRealizado(g.data, hoje))
  const aguardandoAno = doAno.filter((g) => g.status !== STATUS_COMPRADO)

  const gastoPeriodo = somarValores(compradosPeriodo)
  const gastoAno = somarValores(compradosAno)

  const frequenciaCampeonatos = agruparJogos(compradosAno, 'campeonato', 'contagem')
  const frequenciaEstadios = agruparJogos(realizadosAno, 'estadio', 'contagem')

  return {
    ano: String(ano),
    mes,
    rotuloPeriodo: rotuloPeriodo(ano, mes),
    totalJogosPeriodo: doPeriodo.length,
    totalJogosAno: doAno.length,

    gastoPeriodo,
    ingressosPeriodo: compradosPeriodo.length,
    ticketMedioPeriodo: media(gastoPeriodo, compradosPeriodo.length),
    gastoPorCampPeriodo: agruparJogos(compradosPeriodo, 'campeonato', 'gasto'),

    gastoAno,
    ingressosAno: compradosAno.length,
    ticketMedioAno: media(gastoAno, compradosAno.length),
    gastoPorCampAno: agruparJogos(compradosAno, 'campeonato', 'gasto'),

    jogosCompradosAno: compradosAno.length,
    jogosRealizadosAno: realizadosAno.length,
    jogosFuturosAno: compradosAno.length - realizadosAno.length,
    aguardandoAno: aguardandoAno.length,
    frequenciaCampeonatos,
    campeonatosDistintos: frequenciaCampeonatos.length,

    frequenciaEstadios,
    estadiosDistintos: frequenciaEstadios.length,
    estadioMaisVisitado: frequenciaEstadios[0] || null,
  }
}

/*
  Ordenacao de agenda: primeiro os jogos de hoje em diante (do mais proximo
  para o mais distante), depois os realizados (do mais recente para o mais antigo).
*/
export const ordenarAgenda = (lista, hoje = new Date()) =>
  [...lista].sort((a, b) => {
    const da = diasAteJogo(a.data, hoje)
    const db = diasAteJogo(b.data, hoje)
    if (da === null && db === null) return 0
    if (da === null) return 1
    if (db === null) return -1
    const futuroA = da >= 0
    const futuroB = db >= 0
    if (futuroA !== futuroB) return futuroA ? -1 : 1
    return futuroA ? da - db : db - da
  })
