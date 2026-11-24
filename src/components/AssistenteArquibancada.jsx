import { useEffect, useRef, useState } from 'react'
import {
  NOMES_MESES,
  STATUS_COMPRADO,
  agruparJogos,
  descreverDistancia,
  diasAteJogo,
  formatCurrency,
  formatarDataBr,
  formatarDataExtenso,
  jogoRealizado,
  normalizarTexto,
  paraCentavos,
  parseDataJogo,
  plural,
  somarValores,
} from '../utils/arquibancada'

/* ================================================================== */
/* Motor de respostas (local, sem APIs externas)                        */
/* ================================================================== */

export const PERGUNTAS_RAPIDAS = [
  'Quanto já gastei este ano?',
  'Qual é o meu próximo jogo?',
  'Qual estádio mais visitei?',
  'Como marco um ingresso como comprado?',
  'Quais jogos ainda aguardam compra?',
  'Resumo do período selecionado',
]

const MESES_NORMALIZADOS = NOMES_MESES.map(normalizarTexto)

// Remove acentos e pontuacao para facilitar a comparacao
const prepararTexto = (texto) =>
  normalizarTexto(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const PALAVRAS_GENERICAS = new Set(['campeonato', 'estadio', 'arena', 'copa', 'de', 'do', 'da', 'dos', 'das'])

// Formas pelas quais um nome (estadio, campeonato, clube) pode aparecer na pergunta
const variantesDoNome = (nome) => {
  const base = prepararTexto(nome)
  const variantes = new Set([base])
  const parenteses = String(nome).match(/\(([^)]+)\)/)
  if (parenteses) {
    variantes.add(prepararTexto(parenteses[1]))
    variantes.add(prepararTexto(String(nome).replace(/\([^)]*\)/, '')))
  }
  const semPrefixo = base.replace(/^campeonato /, '')
  if (semPrefixo !== base) variantes.add(semPrefixo)
  return Array.from(variantes).filter((v) => v.length >= 3 && !PALAVRAS_GENERICAS.has(v))
}

const contemTermo = (texto, termo) => new RegExp(`(^|\\s)${termo}(\\s|$)`).test(texto)

// Procura na pergunta um valor existente nos jogos do utilizador (ex.: "maracana", "libertadores")
const encontrarEntidade = (texto, games, campo) => {
  const valores = new Map()
  games.forEach((g) => {
    const valor = String(g[campo] || '').trim()
    if (valor) valores.set(normalizarTexto(valor), valor)
  })
  const candidatos = Array.from(valores.values())
    .map((valor) => ({ valor, variantes: variantesDoNome(valor) }))
    .sort((a, b) => b.valor.length - a.valor.length)
  const achado = candidatos.find((c) => c.variantes.some((v) => contemTermo(texto, v)))
  return achado ? achado.valor : null
}

const resolverPeriodo = (texto, hoje, padrao) => {
  const anoAtual = hoje.getFullYear()
  const anoEncontrado = texto.match(/\b(19|20)\d{2}\b/)
  let ano = anoEncontrado ? Number(anoEncontrado[0]) : null
  if (!ano && /\bano passado\b/.test(texto)) ano = anoAtual - 1

  let mes = null
  const indiceMes = MESES_NORMALIZADOS.findIndex((m) => contemTermo(texto, m))
  if (indiceMes >= 0) {
    mes = indiceMes + 1
  } else if (/\bmes passado\b/.test(texto)) {
    const ref = new Date(anoAtual, hoje.getMonth() - 1, 1)
    mes = ref.getMonth() + 1
    if (!ano) ano = ref.getFullYear()
  } else if (/\b(este|esse|neste|nesse|deste|desse) mes\b|\bmes atual\b|\b(no|do) mes\b/.test(texto)) {
    mes = hoje.getMonth() + 1
  }

  if (mes) return { tipo: 'mes', ano: ano ?? anoAtual, mes }
  if (ano) return { tipo: 'ano', ano }
  if (/\b(este|esse|neste|nesse|deste|desse) ano\b|\bano atual\b|\b(no|do) ano\b/.test(texto)) {
    return { tipo: 'ano', ano: anoAtual }
  }
  if (/\b(total|tudo|sempre|historico|todos os anos|desde o inicio|ate hoje|geral|ao todo)\b/.test(texto)) {
    return { tipo: 'total' }
  }
  return padrao === 'total' ? { tipo: 'total' } : { tipo: 'ano', ano: anoAtual }
}

const filtrarPeriodo = (lista, periodo) => {
  if (periodo.tipo === 'total') return lista
  return lista.filter((g) => {
    const p = parseDataJogo(g.data)
    if (!p || Number(p.ano) !== periodo.ano) return false
    return periodo.tipo === 'ano' || Number(p.mes) === periodo.mes
  })
}

const descreverPeriodo = (periodo) => {
  if (periodo.tipo === 'total') return 'no total'
  if (periodo.tipo === 'ano') return `em ${periodo.ano}`
  return `em ${NOMES_MESES[periodo.mes - 1].toLowerCase()} de ${periodo.ano}`
}

const rotuloDestaquePeriodo = (periodo) => {
  if (periodo.tipo === 'total') return 'desde o primeiro registro'
  if (periodo.tipo === 'ano') return String(periodo.ano)
  return `${NOMES_MESES[periodo.mes - 1]} de ${periodo.ano}`
}

const percentual = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0)

const ordenarPorData = (lista, crescente = true) =>
  [...lista].sort((a, b) => {
    const da = parseDataJogo(a.data)?.date?.getTime() ?? 0
    const db = parseDataJogo(b.data)?.date?.getTime() ?? 0
    return crescente ? da - db : db - da
  })

const listarEmpate = (ranking) => {
  if (ranking.length === 0) return []
  return ranking.filter((item) => item.valor === ranking[0].valor)
}

const juntarNomes = (nomes) => {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

const linhasRanking = (ranking, formatar, limite = 3) =>
  ranking.slice(0, limite).map((item, i) => `${i + 1}. ${item.rotulo}: ${formatar(item.valor)}`)

/*
  Responde a uma pergunta usando apenas os dados do painel.
  contexto = { games, stats, nome, time, hoje }
  Retorna { texto, destaque?: { valor, rotulo }, sugestoes?: string[] }
*/
export function responderPergunta(pergunta, contexto = {}) {
  const { games = [], stats = null, nome = '', time = '', hoje = new Date() } = contexto
  const t = prepararTexto(pergunta).replace(/\bamigave(l|is)\b/g, 'amistoso')
  const tem = (re) => re.test(t)
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || ''

  const comprados = games.filter((g) => g.status === STATUS_COMPRADO)
  const realizados = comprados.filter((g) => jogoRealizado(g.data, hoje))
  const confronto = (g) => `${time || g.clube || 'Meu time'} x ${g.adversario}`
  const descreverJogo = (g) => `${confronto(g)}, ${g.campeonato || 'campeonato'}. Local: ${g.estadio}`

  if (!t) {
    return { texto: 'Escreva uma pergunta ou escolha uma das sugestões.', sugestoes: PERGUNTAS_RAPIDAS.slice(0, 3) }
  }

  /* ---------------------------- Como usar ---------------------------- */
  const pedeInstrucao = tem(/\b(como|onde|de que forma|passo a passo|consigo|posso|da para)\b/)

  if (pedeInstrucao) {
    if (tem(/compr|pago|paguei|marc/)) {
      return {
        texto: [
          'Para marcar um ingresso como comprado:',
          '1. Encontre a partida na secção Partidas (ajuste o mês e o ano, se for preciso).',
          '2. No cartão da partida, clique no botão Marcar como comprado, na parte inferior do cartão.',
          '3. Informe o valor pago, por exemplo 120,00, e clique em Confirmar compra.',
          '',
          'O valor passa a contar no Gasto no mês e no Gasto anual, e a partida entra em Campeonatos. A partir do dia seguinte ao jogo, o estádio também conta em Estádios visitados.',
          'Se já tiver o ingresso ao registrar o jogo, escolha Comprado em Situação do ingresso no formulário Novo jogo.',
        ].join('\n'),
        sugestoes: ['Quais jogos ainda aguardam compra?', 'Como adiciono um jogo?'],
      }
    }
    if (tem(/adicion|cadastr|novo jogo|criar|registr|inclu|lanc/)) {
      return {
        texto: [
          'Para registrar uma partida:',
          '1. Clique em Novo jogo, ao lado do botão Assistente.',
          '2. Escolha o campeonato, o adversário, a data e o estádio.',
          '3. Defina a situação do ingresso (Aguardando ou Comprado) e, se quiser, o valor.',
          '4. Clique em Salvar jogo.',
          '',
          'O painel muda automaticamente para o mês da partida registrada.',
        ].join('\n'),
        sugestoes: ['Como marco um ingresso como comprado?', 'Qual é o meu próximo jogo?'],
      }
    }
    if (tem(/exclu|apag|remov|delet/)) {
      return {
        texto:
          'No cartão da partida, clique em Excluir e confirme no aviso que aparece logo abaixo. A ação não pode ser desfeita, e o jogo deixa de contar em todos os indicadores.',
        sugestoes: ['Como adiciono um jogo?'],
      }
    }
    if (tem(/valor|preco|edit|alter|corrig|mudar o valor/)) {
      return {
        texto:
          'Para jogos que ainda aguardam compra, o valor é informado ao clicar em Marcar como comprado. Para um jogo já marcado como comprado não há edição direta: exclua a partida e registre-a novamente com o valor correto.',
        sugestoes: ['Como marco um ingresso como comprado?'],
      }
    }
    if (tem(/filtr|periodo|mes|ano|mudar|trocar|escolher/)) {
      return {
        texto: [
          'Use os seletores de mês e ano no topo do painel.',
          'Todos os meses mostra o ano inteiro. O botão Mês atual volta ao período corrente.',
          'Na secção Partidas, os filtros Todas, Compradas e Aguardando refinam a lista do período escolhido.',
        ].join('\n'),
        sugestoes: ['Resumo do período selecionado'],
      }
    }
    if (tem(/\bnome\b/)) {
      return {
        texto: 'Clique nas suas iniciais, no canto superior direito, para adicionar ou editar o nome exibido no painel.',
      }
    }
    if (tem(/assistente|voce|funciona|usar/)) {
      return respostaAjuda()
    }
  }

  /* ---------------------------- Conversa ---------------------------- */
  if (tem(/\b(ajuda|help|o que (voce )?(sabe|faz|pode)|quais perguntas|comandos)\b/)) {
    return respostaAjuda()
  }

  if (tem(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|hey)\b/) && t.split(' ').length <= 4) {
    return {
      texto: `Olá${primeiroNome ? `, ${primeiroNome}` : ''}. Posso consultar os seus gastos, jogos, estádios e campeonatos. Por onde quer começar?`,
      sugestoes: PERGUNTAS_RAPIDAS.slice(0, 3),
    }
  }

  if (tem(/^(obrigad|valeu|brigad|agradec)/)) {
    return { texto: 'Disponha. Se precisar de mais alguma informação do painel, é só perguntar.' }
  }

  if (tem(/\b(meu nome|quem sou eu|como me chamo)\b/)) {
    return {
      texto: nome
        ? `O nome registado no seu perfil é ${nome}.`
        : 'Ainda não há um nome no seu perfil. Clique nas iniciais, no canto superior direito, para adicioná-lo.',
    }
  }

  if (tem(/\b(meu time|meu clube|para quem torco|qual (e )?o meu (time|clube))\b/)) {
    return { texto: time ? `O seu time do coração é o ${time}.` : 'Não há um time definido no seu perfil.' }
  }

  /* ---------------------------- Pendentes ---------------------------- */
  if (tem(/aguard|pendent|falta(m)? comprar|sem ingresso|nao compr|ainda nao|a comprar|por comprar/)) {
    const aguardando = games.filter((g) => g.status !== STATUS_COMPRADO)
    const futuros = ordenarPorData(aguardando.filter((g) => (diasAteJogo(g.data, hoje) ?? -1) >= 0))
    const passados = aguardando.length - futuros.length

    if (aguardando.length === 0) {
      return {
        texto: 'Não há partidas aguardando compra. Todos os jogos registrados já têm ingresso comprado.',
        sugestoes: ['Qual é o meu próximo jogo?'],
      }
    }

    const linhas = []
    if (futuros.length > 0) {
      linhas.push(`${plural(futuros.length, 'partida futura aguarda', 'partidas futuras aguardam')} compra:`)
      futuros.slice(0, 5).forEach((g) => {
        const previsto = Number(g.valorIngresso || 0) > 0 ? `, previsto ${formatCurrency(g.valorIngresso)}` : ''
        linhas.push(`- ${formatarDataBr(g.data)}: ${confronto(g)} (${g.estadio}${previsto})`)
      })
      if (futuros.length > 5) linhas.push(`- e mais ${futuros.length - 5}.`)
    } else {
      linhas.push('Não há partidas futuras aguardando compra.')
    }
    if (passados > 0) {
      linhas.push('')
      linhas.push(
        `${plural(passados, 'jogo que já passou continua', 'jogos que já passaram continuam')} como aguardando. Se esteve presente, marque como comprado para entrar nas estatísticas.`,
      )
    }
    return {
      texto: linhas.join('\n'),
      destaque: { valor: String(futuros.length), rotulo: futuros.length === 1 ? 'Jogo a comprar' : 'Jogos a comprar' },
      sugestoes: ['Como marco um ingresso como comprado?', 'Qual é o meu próximo jogo?'],
    }
  }

  /* ---------------------------- Proximo jogo ---------------------------- */
  if (tem(/proxim|agenda|vem ai|quando (e|sera|tenho|vou|joga)|futuro|calendario/)) {
    const futuros = ordenarPorData(games.filter((g) => (diasAteJogo(g.data, hoje) ?? -1) >= 0))
    if (futuros.length === 0) {
      return {
        texto: 'Não há jogos futuros registrados. Clique em Novo jogo para adicionar a próxima partida.',
        sugestoes: ['Como adiciono um jogo?', 'Qual foi o meu último jogo?'],
      }
    }

    if (tem(/proximos|agenda|calendario|jogos futuros/)) {
      const linhas = futuros.slice(0, 5).map((g) => {
        const situacao = g.status === STATUS_COMPRADO ? 'comprado' : 'aguardando compra'
        return `- ${formatarDataBr(g.data)}: ${confronto(g)}, ${g.estadio} (${situacao})`
      })
      return {
        texto: [`${plural(futuros.length, 'jogo registrado', 'jogos registrados')} a partir de hoje:`, ...linhas].join('\n'),
        destaque: { valor: String(futuros.length), rotulo: 'Jogos por vir' },
        sugestoes: ['Quais jogos ainda aguardam compra?'],
      }
    }

    const g = futuros[0]
    const dias = diasAteJogo(g.data, hoje)
    const comprado = g.status === STATUS_COMPRADO
    const situacao = comprado
      ? `Ingresso comprado por ${formatCurrency(g.valorIngresso)}.`
      : 'O ingresso ainda aguarda compra. Quando conseguir, use Marcar como comprado no cartão da partida.'
    const seguintes = futuros.length - 1
    return {
      texto: [
        `${descreverJogo(g)}.`,
        `${formatarDataExtenso(g.data).replace(/^./, (c) => c.toUpperCase())}.`,
        situacao,
        seguintes > 0 ? `Depois dele, há ${plural(seguintes, 'outro jogo registrado', 'outros jogos registrados')}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      destaque: { valor: descreverDistancia(dias), rotulo: 'Próximo jogo' },
      sugestoes: seguintes > 0 ? ['Quais são os meus próximos jogos?', 'Quanto já gastei este ano?'] : ['Quanto já gastei este ano?'],
    }
  }

  /* ---------------------------- Ultimo jogo ---------------------------- */
  if (tem(/\bultim|mais recente|jogo anterior/)) {
    const lista = ordenarPorData(realizados, false)
    if (lista.length === 0) {
      return {
        texto: 'Ainda não há jogos realizados com ingresso comprado. Assim que uma partida comprada acontecer, ela aparece aqui.',
        sugestoes: ['Qual é o meu próximo jogo?'],
      }
    }
    const g = lista[0]
    return {
      texto: `${descreverJogo(g)}. Data: ${formatarDataBr(g.data)}. Ingresso: ${formatCurrency(g.valorIngresso)}.`,
      destaque: { valor: descreverDistancia(diasAteJogo(g.data, hoje)), rotulo: 'Último jogo' },
      sugestoes: ['Qual é o meu próximo jogo?', 'Qual estádio mais visitei?'],
    }
  }

  /* ---------------------------- Ingresso mais caro / barato ---------------------------- */
  const querBarato = tem(/mais barat|\bbarat|menor (valor|preco|ingresso)/)
  if (querBarato || tem(/mais car|\bcaro\b|maior (valor|preco|ingresso)/)) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const lista = filtrarPeriodo(comprados, periodo)
    if (lista.length === 0) {
      return { texto: `Não há ingressos comprados ${descreverPeriodo(periodo)}.` }
    }
    const ordenados = [...lista].sort((a, b) =>
      querBarato
        ? paraCentavos(a.valorIngresso) - paraCentavos(b.valorIngresso)
        : paraCentavos(b.valorIngresso) - paraCentavos(a.valorIngresso),
    )
    const g = ordenados[0]
    return {
      texto: `${descreverJogo(g)}. Data: ${formatarDataBr(g.data)}. Considerados ${plural(lista.length, 'ingresso comprado', 'ingressos comprados')} ${descreverPeriodo(periodo)}.`,
      destaque: {
        valor: formatCurrency(g.valorIngresso),
        rotulo: querBarato ? 'Ingresso mais barato' : 'Ingresso mais caro',
      },
      sugestoes: ['Qual é a minha média por jogo?', 'Quanto já gastei este ano?'],
    }
  }

  /* ---------------------------- Media ---------------------------- */
  if (tem(/\bmedia\b|\bmedio\b|ticket/)) {
    const periodo = resolverPeriodo(t, hoje, 'ano')
    const lista = filtrarPeriodo(comprados, periodo)
    if (lista.length === 0) {
      return { texto: `Não há ingressos comprados ${descreverPeriodo(periodo)} para calcular a média.` }
    }
    const total = somarValores(lista)
    const media = Math.round((total * 100) / lista.length) / 100
    return {
      texto: `${formatCurrency(total)} em ${plural(lista.length, 'ingresso', 'ingressos')} ${descreverPeriodo(periodo)}.`,
      destaque: { valor: formatCurrency(media), rotulo: `Média por jogo, ${rotuloDestaquePeriodo(periodo)}` },
      sugestoes: ['Qual foi o ingresso mais caro?', 'Quanto já gastei este ano?'],
    }
  }

  /* ---------------------------- Gastos ---------------------------- */
  const campeonatoCitado = encontrarEntidade(t, games, 'campeonato')
  const estadioCitado = encontrarEntidade(t, games, 'estadio')
  const adversarioCitado = encontrarEntidade(t, games, 'adversario')

  if (tem(/gast|despes|investi|dinheiro|paguei|pagou|custo|desembols|quanto (ja )?(foi|sai|custou)/)) {
    const entidade = campeonatoCitado || estadioCitado
    const periodo = resolverPeriodo(t, hoje, entidade ? 'total' : 'ano')
    let lista = filtrarPeriodo(comprados, periodo)
    if (campeonatoCitado) lista = lista.filter((g) => normalizarTexto(g.campeonato) === normalizarTexto(campeonatoCitado))
    else if (estadioCitado) lista = lista.filter((g) => normalizarTexto(g.estadio) === normalizarTexto(estadioCitado))

    const total = somarValores(lista)
    const recorte = entidade ? ` em ${entidade}` : ''
    const rotulo = `Gasto${entidade ? ` em ${entidade}` : ''}, ${rotuloDestaquePeriodo(periodo)}`

    if (lista.length === 0) {
      return {
        texto: `Não há ingressos comprados${recorte} ${descreverPeriodo(periodo)}. Quando marcar um jogo como comprado, o valor entra automaticamente nesta conta.`,
        destaque: { valor: formatCurrency(0), rotulo },
        sugestoes: ['Como marco um ingresso como comprado?', 'Quais jogos ainda aguardam compra?'],
      }
    }

    const linhas = [
      `${plural(lista.length, 'ingresso comprado', 'ingressos comprados')}${recorte} ${descreverPeriodo(periodo)}, com média de ${formatCurrency(
        Math.round((total * 100) / lista.length) / 100,
      )} por jogo.`,
    ]

    if (!campeonatoCitado) {
      const porCampeonato = agruparJogos(lista, 'campeonato', 'gasto')
      if (porCampeonato.length > 1) {
        const lider = porCampeonato[0]
        linhas.push(
          `Maior gasto por campeonato: ${lider.rotulo}, com ${formatCurrency(lider.valor)} (${percentual(lider.valor, total)}% do total).`,
        )
      } else if (porCampeonato.length === 1) {
        linhas.push(`Todo o valor corresponde a ${porCampeonato[0].rotulo}.`)
      }
    }

    const previstos = filtrarPeriodo(
      games.filter((g) => g.status !== STATUS_COMPRADO && Number(g.valorIngresso || 0) > 0),
      periodo,
    )
    if (!entidade && previstos.length > 0) {
      linhas.push(
        `Há ainda ${formatCurrency(somarValores(previstos))} previstos em ${plural(previstos.length, 'jogo', 'jogos')} aguardando compra, que não entram no total.`,
      )
    }

    return {
      texto: linhas.join('\n'),
      destaque: { valor: formatCurrency(total), rotulo },
      sugestoes:
        periodo.tipo === 'mes'
          ? ['Quanto já gastei este ano?', 'Qual foi o ingresso mais caro?']
          : ['Quanto gastei este mês?', 'Qual foi o ingresso mais caro?'],
    }
  }

  /* ---------------------------- Resumo ---------------------------- */
  if (tem(/resumo|balanco|panorama|visao geral|como estou|estatistic|periodo selecionado|relatorio/)) {
    if (!stats) return respostaAjuda()
    const linhas = [
      `Período selecionado no painel: ${stats.rotuloPeriodo}.`,
      `- Gasto no período: ${formatCurrency(stats.gastoPeriodo)} em ${plural(stats.ingressosPeriodo, 'ingresso', 'ingressos')}.`,
      `- Gasto em ${stats.ano}: ${formatCurrency(stats.gastoAno)} em ${plural(stats.ingressosAno, 'ingresso', 'ingressos')}.`,
      `- Jogos com ingresso comprado em ${stats.ano}: ${stats.jogosCompradosAno} (${stats.jogosRealizadosAno} realizados, ${stats.jogosFuturosAno} por vir).`,
      `- Estádios visitados em ${stats.ano}: ${stats.estadiosDistintos}${
        stats.estadioMaisVisitado ? `, com destaque para ${stats.estadioMaisVisitado.rotulo}` : ''
      }.`,
      `- Jogos aguardando compra em ${stats.ano}: ${stats.aguardandoAno}.`,
    ]
    return {
      texto: linhas.join('\n'),
      destaque: { valor: formatCurrency(stats.gastoPeriodo), rotulo: `Gasto, ${stats.rotuloPeriodo}` },
      sugestoes: ['Qual é o meu próximo jogo?', 'Qual estádio mais visitei?'],
    }
  }

  /* ---------------------------- Estadio citado ---------------------------- */
  if (estadioCitado) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const visitas = ordenarPorData(
      filtrarPeriodo(realizados, periodo).filter((g) => normalizarTexto(g.estadio) === normalizarTexto(estadioCitado)),
      false,
    )
    const futuros = comprados.filter(
      (g) => normalizarTexto(g.estadio) === normalizarTexto(estadioCitado) && !jogoRealizado(g.data, hoje),
    )
    const linhas = [
      visitas.length > 0
        ? `${estadioCitado}: ${plural(visitas.length, 'visita', 'visitas')} ${descreverPeriodo(periodo)}. A mais recente foi em ${formatarDataBr(visitas[0].data)} (${confronto(visitas[0])}).`
        : `${estadioCitado}: nenhuma visita registrada ${descreverPeriodo(periodo)}.`,
    ]
    if (futuros.length > 0) linhas.push(`Há ainda ${plural(futuros.length, 'jogo comprado', 'jogos comprados')} por vir neste estádio.`)
    return {
      texto: linhas.join('\n'),
      destaque: { valor: String(visitas.length), rotulo: `Visitas, ${estadioCitado}` },
      sugestoes: ['Qual estádio mais visitei?'],
    }
  }

  /* ---------------------------- Adversario citado ---------------------------- */
  if (adversarioCitado) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const jogos = ordenarPorData(
      filtrarPeriodo(realizados, periodo).filter(
        (g) => normalizarTexto(g.adversario) === normalizarTexto(adversarioCitado),
      ),
      false,
    )
    return {
      texto:
        jogos.length > 0
          ? `Esteve em ${plural(jogos.length, 'jogo', 'jogos')} contra ${adversarioCitado} ${descreverPeriodo(periodo)}. O mais recente foi em ${formatarDataBr(jogos[0].data)}. Local: ${jogos[0].estadio}.`
          : `Não há jogos realizados contra ${adversarioCitado} com ingresso comprado ${descreverPeriodo(periodo)}.`,
      destaque: { valor: String(jogos.length), rotulo: `Jogos contra ${adversarioCitado}` },
      sugestoes: ['Contra qual adversário mais fui?'],
    }
  }

  /* ---------------------------- Campeonato citado ---------------------------- */
  if (campeonatoCitado) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const jogos = filtrarPeriodo(comprados, periodo).filter(
      (g) => normalizarTexto(g.campeonato) === normalizarTexto(campeonatoCitado),
    )
    const feitos = jogos.filter((g) => jogoRealizado(g.data, hoje)).length
    return {
      texto:
        jogos.length > 0
          ? `${campeonatoCitado}: ${plural(jogos.length, 'jogo', 'jogos')} com ingresso comprado ${descreverPeriodo(periodo)}, ${feitos} realizados e ${jogos.length - feitos} por vir. Total gasto: ${formatCurrency(somarValores(jogos))}.`
          : `${campeonatoCitado}: nenhum jogo com ingresso comprado ${descreverPeriodo(periodo)}.`,
      destaque: { valor: String(jogos.length), rotulo: `Jogos, ${campeonatoCitado}` },
      sugestoes: ['Qual campeonato mais acompanhei?'],
    }
  }

  /* ---------------------------- Adversarios ---------------------------- */
  if (tem(/adversari|rival|contra quem|contra qual|enfrent/)) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const ranking = agruparJogos(filtrarPeriodo(realizados, periodo), 'adversario', 'contagem')
    if (ranking.length === 0) {
      return { texto: `Não há jogos realizados com ingresso comprado ${descreverPeriodo(periodo)}.` }
    }
    const lideres = listarEmpate(ranking)
    return {
      texto: [
        lideres.length > 1
          ? `Empate entre ${juntarNomes(lideres.map((l) => l.rotulo))}, com ${plural(lideres[0].valor, 'jogo', 'jogos')} cada ${descreverPeriodo(periodo)}.`
          : `${lideres[0].rotulo}, com ${plural(lideres[0].valor, 'jogo', 'jogos')} ${descreverPeriodo(periodo)}.`,
        ...(ranking.length > 1 ? ['', ...linhasRanking(ranking, (n) => plural(n, 'jogo', 'jogos'))] : []),
      ].join('\n'),
      destaque: {
        valor: lideres.length > 1 ? `${lideres.length} empatados` : lideres[0].rotulo,
        rotulo: 'Adversário mais visto',
      },
    }
  }

  /* ---------------------------- Estadios ---------------------------- */
  if (tem(/estadi|arena/)) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const ranking = agruparJogos(filtrarPeriodo(realizados, periodo), 'estadio', 'contagem')

    if (ranking.length === 0) {
      return {
        texto: `Ainda não há estádios visitados ${descreverPeriodo(periodo)}. Um estádio conta como visitado quando o ingresso está comprado e a data do jogo já passou.`,
        sugestoes: ['Qual é o meu próximo jogo?'],
      }
    }

    if (tem(/quant|numero|distint|diferent/)) {
      return {
        texto: [
          `${plural(ranking.length, 'estádio diferente', 'estádios diferentes')} ${descreverPeriodo(periodo)}, em ${plural(
            ranking.reduce((acc, r) => acc + r.valor, 0),
            'jogo realizado',
            'jogos realizados',
          )}.`,
          ...linhasRanking(ranking, (n) => plural(n, 'visita', 'visitas')),
        ].join('\n'),
        destaque: { valor: String(ranking.length), rotulo: `Estádios visitados, ${rotuloDestaquePeriodo(periodo)}` },
        sugestoes: ['Qual estádio mais visitei?'],
      }
    }

    const totalVisitas = ranking.reduce((acc, r) => acc + r.valor, 0)
    const lideres = listarEmpate(ranking)
    const abertura =
      lideres.length > 1
        ? `Empate entre ${juntarNomes(lideres.map((l) => l.rotulo))}, com ${plural(lideres[0].valor, 'visita', 'visitas')} cada ${descreverPeriodo(periodo)}.`
        : `${lideres[0].rotulo}, com ${plural(lideres[0].valor, 'visita', 'visitas')} ${descreverPeriodo(periodo)} (${percentual(
            lideres[0].valor,
            totalVisitas,
          )}% das suas presenças).`
    return {
      texto: [abertura, ...(ranking.length > 1 ? ['', 'Ranking:', ...linhasRanking(ranking, (n) => plural(n, 'visita', 'visitas'))] : [])].join('\n'),
      destaque: {
        valor: lideres.length > 1 ? `${lideres.length} empatados` : lideres[0].rotulo,
        rotulo: 'Estádio mais visitado',
      },
      sugestoes: ['Quantos estádios diferentes já visitei?', 'Qual campeonato mais acompanhei?'],
    }
  }

  /* ---------------------------- Campeonatos ---------------------------- */
  if (tem(/campeonat|competic|torneio|\bliga\b/)) {
    const periodo = resolverPeriodo(t, hoje, 'total')
    const ranking = agruparJogos(filtrarPeriodo(comprados, periodo), 'campeonato', 'contagem')
    if (ranking.length === 0) {
      return { texto: `Não há jogos com ingresso comprado ${descreverPeriodo(periodo)}.` }
    }
    const lideres = listarEmpate(ranking)
    return {
      texto: [
        lideres.length > 1
          ? `Empate entre ${juntarNomes(lideres.map((l) => l.rotulo))}, com ${plural(lideres[0].valor, 'jogo', 'jogos')} cada.`
          : `${lideres[0].rotulo}, com ${plural(lideres[0].valor, 'jogo', 'jogos')} ${descreverPeriodo(periodo)}.`,
        `Ao todo, ${plural(ranking.length, 'campeonato', 'campeonatos')} com ingresso comprado.`,
        ...(ranking.length > 1 ? ['', ...linhasRanking(ranking, (n) => plural(n, 'jogo', 'jogos'))] : []),
      ].join('\n'),
      destaque: {
        valor: lideres.length > 1 ? `${lideres.length} empatados` : lideres[0].rotulo,
        rotulo: 'Campeonato mais acompanhado',
      },
      sugestoes: ['Qual estádio mais visitei?'],
    }
  }

  /* ---------------------------- Quantidade de jogos ---------------------------- */
  if (tem(/quant(os|as) (jogos|partidas|vezes)|presenc|frequenc|fui a|assisti|jogos fui|fui ao estadio|quantos/)) {
    const periodo = resolverPeriodo(t, hoje, 'ano')
    const doPeriodo = filtrarPeriodo(comprados, periodo)
    const feitos = doPeriodo.filter((g) => jogoRealizado(g.data, hoje)).length
    const porVir = doPeriodo.length - feitos
    const aguardando = filtrarPeriodo(
      games.filter((g) => g.status !== STATUS_COMPRADO),
      periodo,
    ).length
    return {
      texto: [
        `${plural(feitos, 'jogo realizado', 'jogos realizados')} com ingresso comprado ${descreverPeriodo(periodo)}.`,
        porVir > 0 ? `Mais ${plural(porVir, 'jogo comprado', 'jogos comprados')} por vir.` : '',
        aguardando > 0 ? `${plural(aguardando, 'jogo aguarda', 'jogos aguardam')} compra no mesmo período.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      destaque: { valor: String(feitos), rotulo: `Presenças, ${rotuloDestaquePeriodo(periodo)}` },
      sugestoes: ['Qual estádio mais visitei?', 'Qual é o meu próximo jogo?'],
    }
  }

  return {
    texto:
      'Não encontrei uma resposta para essa pergunta nos dados do painel. Posso ajudar com gastos, próximos jogos, ingressos por comprar, estádios, campeonatos, adversários e com o uso do painel.',
    sugestoes: ['Quanto já gastei este ano?', 'Qual é o meu próximo jogo?', 'O que você sabe fazer?'],
  }
}

function respostaAjuda() {
  return {
    texto: [
      'Respondo com base nos jogos registrados no seu painel. Alguns exemplos:',
      '- Quanto gastei em março? Quanto gastei na Libertadores?',
      '- Qual é o meu próximo jogo? Quais são os meus próximos jogos?',
      '- Quais jogos ainda aguardam compra?',
      '- Qual estádio mais visitei? Quantas vezes fui ao Maracanã?',
      '- Qual campeonato mais acompanhei? Contra qual adversário mais fui?',
      '- Qual foi o ingresso mais caro? Qual é a minha média por jogo?',
      '- Como marco um ingresso como comprado? Como excluo um jogo?',
    ].join('\n'),
    sugestoes: PERGUNTAS_RAPIDAS.slice(0, 3),
  }
}

/* ================================================================== */
/* Interface                                                            */
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

const IconeSeta = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M8 5.5L12.5 10 8 14.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconeMarca = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M4 15.5V11M8 15.5V7M12 15.5V9.5M16 15.5V4.5" strokeLinecap="round" />
  </svg>
)

export default function AssistenteArquibancada({ aberto, onFechar, games = [], stats = null, nome = '', time = '' }) {
  const [mensagens, setMensagens] = useState([])
  const [entrada, setEntrada] = useState('')
  const proximoId = useRef(1)
  const areaRef = useRef(null)
  const campoRef = useRef(null)

  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || ''

  useEffect(() => {
    if (aberto) {
      const id = window.setTimeout(() => campoRef.current?.focus({ preventScroll: true }), 150)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [aberto])

  useEffect(() => {
    const area = areaRef.current
    if (area) area.scrollTop = area.scrollHeight
  }, [mensagens])

  const perguntar = (texto) => {
    const pergunta = String(texto || '').trim()
    if (!pergunta) return
    const resposta = responderPergunta(pergunta, { games, stats, nome, time, hoje: new Date() })
    const idPergunta = proximoId.current++
    const idResposta = proximoId.current++
    setMensagens((atual) => [
      ...atual,
      { id: idPergunta, autor: 'usuario', texto: pergunta },
      { id: idResposta, autor: 'assistente', ...resposta },
    ])
    setEntrada('')
  }

  const aoEnviar = (event) => {
    event.preventDefault()
    perguntar(entrada)
  }

  const ultimaResposta = [...mensagens].reverse().find((m) => m.autor === 'assistente')

  return (
    <div
      role="dialog"
      aria-label="Assistente do Diário de Arquibancada"
      aria-hidden={!aberto}
      inert={!aberto}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onFechar()
      }}
      className={`fixed inset-x-3 bottom-3 z-40 flex h-[min(620px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_24px_56px_-12px_rgba(15,23,42,0.22),0_8px_20px_-8px_rgba(15,23,42,0.10)] transition-[opacity,transform] duration-200 ease-out sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[min(620px,calc(100dvh-7rem))] ${
        aberto ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      {/* Cabecalho */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <IconeMarca className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-slate-900">Assistente</p>
            <p className="truncate text-xs text-slate-500">Respostas com base nos seus dados</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {mensagens.length > 0 ? (
            <button
              type="button"
              onClick={() => setMensagens([])}
              className="h-8 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Limpar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar assistente"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconeFechar className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conversa */}
      <div
        ref={areaRef}
        aria-live="polite"
        className="flex-1 overflow-y-auto px-5 py-5 [scrollbar-color:#e2e8f0_transparent] [scrollbar-width:thin]"
      >
        {mensagens.length === 0 ? (
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-slate-900">
              Olá{primeiroNome ? `, ${primeiroNome}` : ''}.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Pergunte sobre gastos, próximos jogos, estádios ou como usar o painel. As respostas são calculadas na
              hora com os jogos que registrou.
            </p>

            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Perguntas rápidas</p>
            <div className="mt-2.5 space-y-1.5">
              {PERGUNTAS_RAPIDAS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => perguntar(p)}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white px-3.5 py-2.5 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                >
                  <span>{p}</span>
                  <IconeSeta className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {mensagens.map((m) =>
              m.autor === 'usuario' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-sm text-white">
                    {m.texto}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start">
                  <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200/70">
                    {m.destaque ? (
                      <div className="mb-2.5 border-b border-slate-200/70 pb-2.5">
                        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                          {m.destaque.rotulo}
                        </p>
                        <p className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
                          {m.destaque.valor}
                        </p>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{m.texto}</p>
                  </div>

                  {m === ultimaResposta && m.sugestoes?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.sugestoes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => perguntar(s)}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* Entrada */}
      <form onSubmit={aoEnviar} className="border-t border-slate-100 px-4 pb-4 pt-3">
        <div className="relative">
          <input
            ref={campoRef}
            type="text"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="Escreva uma pergunta"
            aria-label="Pergunta para o assistente"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-12 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5"
          />
          <button
            type="submit"
            disabled={!entrada.trim()}
            aria-label="Enviar pergunta"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <IconeEnviar className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Usa apenas os dados registrados no seu painel.
        </p>
      </form>
    </div>
  )
}
