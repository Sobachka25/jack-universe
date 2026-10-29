import { GameId } from './activity';

export interface GameCard {
  id: GameId;
  title: string;
  blurb: string;
  ready: boolean;
  briefing: string;
}

export const GAME_CATALOG: GameCard[] = [
  {
    id: 'server-balance',
    title: 'Не роняй сервак',
    blurb: 'Две кнопки и пятнадцать секунд. Уронил стойку — на hh.',
    ready: true,
    briefing:
      'На телефоне две кнопки: влево и вправо. Они наклоняют сервер, а стойка сама заваливается. Удержи её пятнадцать секунд и не урони.',
  },
  {
    id: 'friday-release',
    title: 'Пятничный релиз',
    blurb: 'Одна кнопка. Попади в зелёное окно пайплайна.',
    ready: true,
    briefing:
      'По экрану едет маркер. На телефоне одна кнопка «Выкатить». Жми, когда маркер в зелёной полосе. Мимо — релиз ушёл в прод.',
  },
  {
    id: 'night-pager',
    title: 'Ночной пейджер',
    blurb: 'Назови минуту. Мёртвая зона откроется в конце.',
    ready: true,
    briefing:
      'На телефоне поставь минуту от 0 до 100. В конце откроется мёртвая зона. Кто в неё попал, тот не проснулся.',
  },
  {
    id: 'red-button',
    title: 'Красная кнопка',
    blurb: 'Четыре действия. Одно сегодня увольняет.',
    ready: true,
    briefing:
      'На телефоне четыре действия. Три спасают, одно увольняет. Выбери одно. Какое опасное, Николай не скажет.',
  },
  {
    id: 'alert-repeat',
    title: 'Повтори алерты',
    blurb: 'Запомни порядок и набери его на телефоне.',
    ready: true,
    briefing:
      'На экране промелькнут четыре алерта. Запомни порядок. Когда погаснут, набери их на телефоне в том же порядке.',
  },
  {
    id: 'code-review',
    title: 'Код-ревью',
    blurb: 'Четыре ответа. Один верный. Мимо — на hh.',
    ready: false,
    briefing:
      'На телефоне четыре ответа, один верный. Выбери его, пока идёт время. Мимо — на hh.',
  },
];

export function gameCard(id: string): GameCard | undefined {
  return GAME_CATALOG.find((game) => game.id === id);
}
