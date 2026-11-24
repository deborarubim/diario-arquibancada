import { useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../firebase'
import {
  CODIGO_USERNAME_INDISPONIVEL,
  erroUsernameIndisponivel,
  refUsername,
  verificarDisponibilidade,
} from '../services/usernames'
import { normalizarUsername, usernameValido, USERNAME_MAX, USERNAME_MIN } from '../utils/arquibancada'
import { AuthContext } from './auth-context'

const ERRO_CONFIGURACAO = 'Firebase não configurado. Configure as variáveis do arquivo .env.'
const ERRO_USERNAME = `O nome de usuário deve ter de ${USERNAME_MIN} a ${USERNAME_MAX} caracteres: letras minúsculas, números, ponto ou sublinhado.`

const limparNome = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim()

/*
  Firestore
  ---------
  users/{uid}
  {
    nome: string            -> nome completo (ex.: "Débora Silva Anjo")
    username: string        -> @usuario normalizado, sem "@" (ex.: "deboracrf")
    email, time, orcamentoMensal, saldoExtra, createdAt, updatedAt
  }

  usernames/{username}      -> reserva que garante @usuario único
  { uid: string, createdAt: timestamp }

  O displayName do Firebase Auth guarda o nome completo.
*/

// Converte uma recusa das regras numa mensagem clara quando o @usuario foi ocupado no meio do caminho
const tratarErroDeReserva = async (erro, username, uid) => {
  if (erro?.code === CODIGO_USERNAME_INDISPONIVEL) return erro
  if (erro?.code === 'permission-denied') {
    try {
      const livre = await verificarDisponibilidade(username, uid)
      if (!livre) return erroUsernameIndisponivel(username)
    } catch {
      // Mantém o erro original
    }
  }
  return erro
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Resultado da verificação da reserva do @usuario atual: { username, conflito }
  const [reservaVerificada, setReservaVerificada] = useState({ username: '', conflito: false })
  const profileUnsubscribeRef = useRef(null)

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) {
      setUser(null)
      setProfile(null)
      setLoading(false)
      return undefined
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)

      if (profileUnsubscribeRef.current) {
        profileUnsubscribeRef.current()
        profileUnsubscribeRef.current = null
      }

      if (!currentUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      const profileRef = doc(db, 'users', currentUser.uid)
      profileUnsubscribeRef.current = onSnapshot(
        profileRef,
        (snapshot) => {
          setProfile(snapshot.exists() ? snapshot.data() : null)
          setLoading(false)
        },
        () => {
          setProfile(null)
          setLoading(false)
        },
      )
    })

    return () => {
      unsubscribeAuth()
      if (profileUnsubscribeRef.current) {
        profileUnsubscribeRef.current()
      }
    }
  }, [])

  /*
    Contas antigas: o @usuario foi salvo antes de existir a coleção de reservas.
    Ao entrar, tenta reservar esse @usuario. Se outra conta já o reservou,
    marca conflito e a aplicação passa a pedir um novo @usuario.
  */
  const uid = user?.uid || null
  const usernamePerfil = normalizarUsername(profile?.username)

  useEffect(() => {
    if (!db || !uid || !usernamePerfil || !usernameValido(usernamePerfil)) return undefined

    let ativo = true
    const verificar = async () => {
      try {
        const snapshot = await getDoc(refUsername(usernamePerfil))
        if (snapshot.exists()) {
          if (ativo) {
            setReservaVerificada({ username: usernamePerfil, conflito: snapshot.data()?.uid !== uid })
          }
          return
        }
        await setDoc(refUsername(usernamePerfil), { uid, createdAt: serverTimestamp() })
        if (ativo) setReservaVerificada({ username: usernamePerfil, conflito: false })
      } catch (erro) {
        // A criação pode falhar se outra conta reservou o mesmo nome neste instante
        try {
          const snapshot = await getDoc(refUsername(usernamePerfil))
          if (ativo && snapshot.exists()) {
            setReservaVerificada({ username: usernamePerfil, conflito: snapshot.data()?.uid !== uid })
          }
        } catch {
          console.warn('Não foi possível verificar a reserva do nome de usuário.', erro)
        }
      }
    }

    verificar()
    return () => {
      ativo = false
    }
  }, [uid, usernamePerfil])

  const usernameConflito =
    Boolean(usernamePerfil) &&
    reservaVerificada.username === usernamePerfil &&
    reservaVerificada.conflito

  const signIn = async (email, password) => {
    if (!auth || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }
    return signInWithEmailAndPassword(auth, email, password)
  }

  /*
    Cadastro:
    1. Valida nome completo e @usuario.
    2. Confirma que o @usuario está livre (leitura pública de usernames/{username}).
    3. Cria a conta no Firebase Auth.
    4. Grava, num único lote atômico, a reserva usernames/{username} e o perfil users/{uid}.
       Se o lote falhar (por exemplo, o @usuario foi ocupado entre os passos 2 e 4),
       a conta recém-criada é removida para não ficar um cadastro incompleto.
  */
  const signUp = async (email, password, { nome, username, time, orcamentoMensal = 0 } = {}) => {
    if (!auth || !db || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }

    const nomeLimpo = limparNome(nome)
    if (nomeLimpo.split(' ').length < 2) {
      throw new Error('Informe o seu nome completo (nome e sobrenome).')
    }

    const usernameLimpo = normalizarUsername(username)
    if (!usernameValido(usernameLimpo)) {
      throw new Error(ERRO_USERNAME)
    }

    if (!(await verificarDisponibilidade(usernameLimpo))) {
      throw erroUsernameIndisponivel(usernameLimpo)
    }

    const credentials = await createUserWithEmailAndPassword(auth, email, password)
    const novoUid = credentials.user.uid

    try {
      const lote = writeBatch(db)
      lote.set(refUsername(usernameLimpo), { uid: novoUid, createdAt: serverTimestamp() })
      lote.set(doc(db, 'users', novoUid), {
        nome: nomeLimpo,
        username: usernameLimpo,
        email: credentials.user.email,
        time: time || 'Outro',
        orcamentoMensal: Number(orcamentoMensal) || 0,
        saldoExtra: 0,
        createdAt: serverTimestamp(),
      })
      await lote.commit()
    } catch (firestoreError) {
      try {
        await deleteUser(credentials.user)
      } catch (rollbackError) {
        console.warn('Não foi possível desfazer a conta criada.', rollbackError)
      }

      const erroTratado = await tratarErroDeReserva(firestoreError, usernameLimpo, null)
      if (erroTratado.code === CODIGO_USERNAME_INDISPONIVEL) throw erroTratado

      const enhancedError = new Error(
        firestoreError?.message || 'Erro ao salvar o perfil após cadastro.',
      )
      enhancedError.code = firestoreError?.code || 'firestore/write-failed'
      enhancedError.firestoreFailed = true
      throw enhancedError
    }

    try {
      await updateProfile(credentials.user, { displayName: nomeLimpo })
    } catch (profileError) {
      // O nome já está salvo no Firestore; o displayName é apenas um reforço.
      console.warn('Não foi possível atualizar o displayName.', profileError)
    }

    return credentials.user
  }

  /*
    Atualiza nome completo e/ou @usuario.
    A troca de @usuario acontece numa transação:
    - lê a reserva nova; se pertencer a outro uid, bloqueia;
    - cria a reserva nova (se ainda não for sua);
    - remove a reserva antiga, se ela for sua;
    - grava o novo @usuario em users/{uid}.
  */
  const atualizarPerfil = async ({ nome, username } = {}) => {
    if (!auth || !db || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }
    if (!user) {
      throw new Error('Usuário não autenticado.')
    }

    const dadosPerfil = { updatedAt: serverTimestamp() }

    if (nome !== undefined) {
      const nomeLimpo = limparNome(nome)
      if (nomeLimpo.length < 2) {
        throw new Error('Informe um nome válido.')
      }
      dadosPerfil.nome = nomeLimpo
    }

    let novoUsername = null
    if (username !== undefined) {
      const usernameLimpo = normalizarUsername(username)
      if (!usernameValido(usernameLimpo)) {
        throw new Error(ERRO_USERNAME)
      }
      if (usernameLimpo !== usernamePerfil || usernameConflito) {
        novoUsername = usernameLimpo
      }
    }

    if (!novoUsername) {
      await setDoc(doc(db, 'users', user.uid), dadosPerfil, { merge: true })
    } else {
      const usernameAntigo = usernamePerfil && usernamePerfil !== novoUsername ? usernamePerfil : ''

      try {
        await runTransaction(db, async (transacao) => {
          // Todas as leituras precisam acontecer antes das escritas
          const refNovo = refUsername(novoUsername)
          const reservaNova = await transacao.get(refNovo)
          if (reservaNova.exists() && reservaNova.data()?.uid !== user.uid) {
            throw erroUsernameIndisponivel(novoUsername)
          }

          const refAntigo = usernameAntigo ? refUsername(usernameAntigo) : null
          const reservaAntiga = refAntigo ? await transacao.get(refAntigo) : null

          if (!reservaNova.exists()) {
            transacao.set(refNovo, { uid: user.uid, createdAt: serverTimestamp() })
          }
          if (reservaAntiga?.exists() && reservaAntiga.data()?.uid === user.uid) {
            transacao.delete(refAntigo)
          }
          transacao.set(
            doc(db, 'users', user.uid),
            { ...dadosPerfil, username: novoUsername },
            { merge: true },
          )
        })
      } catch (erro) {
        throw await tratarErroDeReserva(erro, novoUsername, user.uid)
      }

      setReservaVerificada({ username: novoUsername, conflito: false })
    }

    if (dadosPerfil.nome) {
      try {
        await updateProfile(user, { displayName: dadosPerfil.nome })
      } catch (profileError) {
        console.warn('Não foi possível atualizar o displayName.', profileError)
      }
    }
  }

  const atualizarNome = (nome) => atualizarPerfil({ nome })

  const addSaldo = async (valor, modo = 'extra') => {
    if (!auth || !db || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }
    if (!user) {
      throw new Error('Usuário não autenticado.')
    }
    const amount = Number(valor)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Valor inválido para adicionar ao saldo.')
    }
    if (modo !== 'extra' && modo !== 'mensal') {
      throw new Error('Modo inválido. Use "extra" ou "mensal".')
    }

    const field = modo === 'mensal' ? 'orcamentoMensal' : 'saldoExtra'
    await updateDoc(doc(db, 'users', user.uid), {
      [field]: increment(amount),
      updatedAt: serverTimestamp(),
    })
  }

  const logout = async () => {
    if (!auth) return
    await signOut(auth)
  }

  // Dados de identificação já resolvidos para o resto da aplicação.
  // Em caso de conflito (conta antiga com @usuario de outra pessoa), username fica vazio.
  const nomeResolvido = limparNome(profile?.nome) || limparNome(user?.displayName)
  const usernameResolvido = usernameConflito ? '' : usernamePerfil

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        nome: nomeResolvido,
        username: usernameResolvido,
        usernameConflito,
        usernameAnterior: usernameConflito ? usernamePerfil : '',
        signIn,
        login: signIn,
        signUp,
        logout,
        addSaldo,
        atualizarPerfil,
        atualizarNome,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
