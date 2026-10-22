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
      'Кнопки валят сервер и копят очки. Он сам норовит упасть. Продержитесь пятнадцать секунд.',
  },
  {
    id: 'friday-release',
    title: 'Пятничный релиз',
    blurb: 'Одна кнопка. Попади в зелёное окно пайплайна.',
    ready: true,
    briefing:
      'Полоса едет сама. Жми «Выкатить», когда маркер в зелёном. Мимо — релиз ушёл в прод.',
  },
  {
    id: 'night-pager',
    title: 'Ночной пейджер',
    blurb: 'Назови минуту. Мёртвая зона откроется в конце.',
    ready: true,
    briefing:
      'В какую минуту после полуночи пришла первая 500-ка? Попавшие в мёртвую зону не проснулись.',
  },
  {
    id: 'red-button',
    title: 'Красная кнопка',
    blurb: 'Четыре действия. Одно сегодня увольняет.',
    ready: true,
    briefing:
      'Инцидент уже идёт. Три действия спасают, одно добивает. Николай не говорит, какое.',
  },
  {
    id: 'alert-repeat',
    title: 'Повтори алерты',
    blurb: 'Запомни порядок и набери его на телефоне.',
    ready: true,
    briefing:
      'Сейчас промелькнёт цепочка алертов. Потом наберите её в том же порядке.',
  },
  {
    id: 'code-review',
    title: 'Код-ревью',
    blurb: 'Вопросы ещё собирают. Запустить пока нельзя.',
    ready: false,
    briefing: 'Вопросы для код-ревью ещё готовятся.',
  },
];

export function gameCard(id: string): GameCard | undefined {
  return GAME_CATALOG.find((game) => game.id === id);
}
