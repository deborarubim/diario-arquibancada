import { useEffect, useState } from 'react'
import { verificarDisponibilidade } from '../services/usernames'
import { normalizarUsername, usernameValido } from '../utils/arquibancada'

const ESPERA_MS = 400

/*
  Checagem de disponibilidade em tempo real (com espera de 400 ms após digitar).

  Estados retornados:
  - 'vazio'        campo em branco
  - 'invalido'     formato fora da regra (3 a 24 caracteres, a-z 0-9 . _)
  - 'atual'        igual ao @usuario que a pessoa já tem
  - 'verificando'  consulta em andamento
  - 'disponivel'   livre para reservar
  - 'indisponivel' já reservado por outro uid
  - 'erro'         não foi possível consultar (a checagem final acontece ao salvar)

  A checagem definitiva é sempre repetida ao salvar, dentro de uma transação.
*/
export function useDisponibilidadeUsername(valor, { usernameAtual = '', uid = null } = {}) {
  const username = normalizarUsername(valor)
  const precisaConsultar = Boolean(username) && usernameValido(username) && username !== usernameAtual

  const [resultado, setResultado] = useState({ username: '', estado: 'vazio' })

  useEffect(() => {
    if (!precisaConsultar) return undefined

    let ativo = true
    const temporizador = window.setTimeout(async () => {
      try {
        const livre = await verificarDisponibilidade(username, uid)
        if (ativo) setResultado({ username, estado: livre ? 'disponivel' : 'indisponivel' })
      } catch (erro) {
        console.warn('Não foi possível verificar o nome de usuário.', erro)
        if (ativo) setResultado({ username, estado: 'erro' })
      }
    }, ESPERA_MS)

    return () => {
      ativo = false
      window.clearTimeout(temporizador)
    }
  }, [username, uid, precisaConsultar])

  if (!username) return 'vazio'
  if (!usernameValido(username)) return 'invalido'
  if (username === usernameAtual) return 'atual'
  if (resultado.username !== username) return 'verificando'
  return resultado.estado
}
