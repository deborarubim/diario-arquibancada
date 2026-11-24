import { useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../firebase'
import { AuthContext } from './auth-context'

const ERRO_CONFIGURACAO = 'Firebase não configurado. Configure as variáveis do arquivo .env.'

const limparNome = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim()

/*
  Documento do perfil em Firestore: users/{uid}
  {
    nome: string            -> nome completo do torcedor (obrigatorio no cadastro)
    username: string        -> identificador interno (nao exibido no painel)
    email: string
    time: string
    orcamentoMensal: number
    saldoExtra: number
    createdAt, updatedAt
  }
*/

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
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

  const signIn = async (email, password) => {
    if (!auth || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }
    return signInWithEmailAndPassword(auth, email, password)
  }

  /*
    Cria a conta e o perfil. O nome completo e gravado no campo "nome"
    do documento users/{uid} e tambem como displayName do Firebase Auth.
  */
  const signUp = async (email, password, { nome, username, time, orcamentoMensal = 0 } = {}) => {
    if (!auth || !db || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }

    const nomeLimpo = limparNome(nome)
    if (!nomeLimpo) {
      throw new Error('Informe o seu nome completo.')
    }

    const credentials = await createUserWithEmailAndPassword(auth, email, password)

    try {
      await setDoc(doc(db, 'users', credentials.user.uid), {
        nome: nomeLimpo,
        username: String(username || '').trim().toLowerCase(),
        email: credentials.user.email,
        time: time || 'Outro',
        orcamentoMensal: Number(orcamentoMensal) || 0,
        saldoExtra: 0,
        createdAt: serverTimestamp(),
      })
    } catch (firestoreError) {
      const enhancedError = new Error(
        firestoreError?.message || 'Erro ao salvar o perfil após cadastro.',
      )
      enhancedError.code = firestoreError?.code || 'firestore/write-failed'
      enhancedError.firestoreFailed = true
      enhancedError.uid = credentials.user.uid
      throw enhancedError
    }

    try {
      await updateProfile(credentials.user, { displayName: nomeLimpo })
    } catch (profileError) {
      // O nome ja esta salvo no Firestore; o displayName e apenas um reforco.
      console.warn('Não foi possível atualizar o displayName.', profileError)
    }

    return credentials.user
  }

  // Permite definir ou corrigir o nome (contas antigas foram criadas sem o campo "nome")
  const atualizarNome = async (nome) => {
    if (!auth || !db || !isFirebaseConfigured) {
      throw new Error(ERRO_CONFIGURACAO)
    }
    if (!user) {
      throw new Error('Usuário não autenticado.')
    }
    const nomeLimpo = limparNome(nome)
    if (nomeLimpo.length < 2) {
      throw new Error('Informe um nome válido.')
    }

    await setDoc(
      doc(db, 'users', user.uid),
      { nome: nomeLimpo, updatedAt: serverTimestamp() },
      { merge: true },
    )

    try {
      await updateProfile(user, { displayName: nomeLimpo })
    } catch (profileError) {
      console.warn('Não foi possível atualizar o displayName.', profileError)
    }
  }

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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        login: signIn,
        signUp,
        logout,
        addSaldo,
        atualizarNome,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
