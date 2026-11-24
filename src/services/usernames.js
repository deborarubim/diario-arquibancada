import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

/*
  Reservas de nome de usuário no Firestore.

  Coleção: usernames/{usernameNormalizado}
  Documento: { uid: string, createdAt: timestamp }

  O ID do documento é o próprio @usuario normalizado (sem "@"), o que garante
  unicidade: as regras só permitem criar o documento se ele ainda não existir.
*/

export const COLECAO_USERNAMES = 'usernames'

export const CODIGO_USERNAME_INDISPONIVEL = 'username/indisponivel'

export const refUsername = (username) => doc(db, COLECAO_USERNAMES, username)

export const mensagemUsernameIndisponivel = (username) =>
  `O @${username} já está em uso por outro torcedor. Escolha outro nome de usuário.`

export const erroUsernameIndisponivel = (username) => {
  const erro = new Error(mensagemUsernameIndisponivel(username))
  erro.code = CODIGO_USERNAME_INDISPONIVEL
  return erro
}

// Mensagem amigável para recusas do Firestore (por exemplo, regras ainda não publicadas)
export const MENSAGEM_PERMISSAO_NEGADA =
  'Não foi possível validar o nome de usuário. Confirme se as regras do Firestore (firestore.rules) foram publicadas e tente novamente.'

/*
  Retorna true se o username estiver livre ou já pertencer ao uid informado.
  A leitura individual (get) é pública nas regras, para permitir a checagem
  na tela de cadastro, antes de a conta existir.
*/
export const verificarDisponibilidade = async (username, uid = null) => {
  if (!db) throw new Error('Firebase não configurado.')
  const snapshot = await getDoc(refUsername(username))
  if (!snapshot.exists()) return true
  return Boolean(uid) && snapshot.data()?.uid === uid
}
