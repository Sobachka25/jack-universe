import type { GameId } from './types'

export interface GameMenuCard {
  id: GameId
  title: string
  blurb: string
  ready: boolean
}

export const GAME_MENU: GameMenuCard[] = [
  {
    id: 'server-balance',
    title: 'Не роняй сервак',
    blurb: 'Две кнопки и пятнадцать секунд. Уронил стойку — на hh.',
    ready: true,
  },
  {
    id: 'friday-release',
    title: 'Пятничный релиз',
    blurb: 'Одна кнопка. Попади в зелёное окно пайплайна.',
    ready: true,
  },
  {
    id: 'night-pager',
    title: 'Ночной пейджер',
    blurb: 'Назови минуту. Мёртвая зона откроется в конце.',
    ready: true,
  },
  {
    id: 'red-button',
    title: 'Красная кнопка',
    blurb: 'Четыре действия. Одно сегодня увольняет.',
    ready: true,
  },
  {
    id: 'alert-repeat',
    title: 'Повтори алерты',
    blurb: 'Запомни порядок и набери его на телефоне.',
    ready: true,
  },
  {
    id: 'code-review',
    title: 'Код-ревью',
    blurb: 'Четыре ответа. Один верный. Мимо — на hh.',
    ready: true,
  },
]
