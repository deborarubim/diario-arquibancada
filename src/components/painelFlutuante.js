/*
  Posicionamento partilhado pelos paineis flutuantes (Chat Global e Assistente).

  O dock fica fixo em bottom-5 right-5 e ocupa cerca de 5,25rem de largura
  e 8,75rem de altura. Os paineis abrem sempre fora dessa area:
  - Mobile: ocupam a largura da tela, do topo ate acima do dock.
  - A partir de sm: ficam ao lado esquerdo do dock, alinhados pela base.
*/

export const POSICAO_PAINEL =
  'fixed inset-x-3 top-3 bottom-[10.75rem] z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_24px_56px_-12px_rgba(15,23,42,0.22),0_8px_20px_-8px_rgba(15,23,42,0.10)] transition-[opacity,transform] duration-200 ease-out sm:inset-x-auto sm:top-auto sm:bottom-5 sm:right-[7.25rem] sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[400px]'

export const visibilidadePainel = (aberto) =>
  aberto ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
