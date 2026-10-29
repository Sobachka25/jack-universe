import * as catalog from './catalog';
import { ALERT_LENGTH, PartyRound } from './party-round';
import { loadQuizQuestions } from './questions';

describe('PartyRound', () => {
  it('asks a sheet question and sends the wrong answer to hh', () => {
    const questions = loadQuizQuestions();
    expect(questions).toHaveLength(23);
    expect(questions[0]?.correct).toBe('«ВОДЫЫЫЫ»');

    const card = catalog.gameCard('code-review');
    expect(card?.ready).toBe(false);
    const spy = jest
      .spyOn(catalog, 'gameCard')
      .mockReturnValue(card && { ...card, ready: true });
    const round = PartyRound.briefing('code-review', () => 0, [
      {
        prompt: 'Где печеньки?',
        correct: 'В шкафу',
        wrong: ['В чате', 'В трекере', 'В проде'],
      },
    ]);
    spy.mockRestore();
    round.start(0, [
      { id: 'a', name: 'Аня' },
      { id: 'b', name: 'Боря' },
    ]);
    round.input('a', { choice: 0 }, 10);
    round.input('b', { choice: 3 }, 20);
    round.tick(12_000);

    const done = round.snapshot(12_000);
    expect(done.status).toBe('result');
    if (done.status !== 'result') return;
    expect(done.sentToHh.map((player) => player.name)).toEqual(['Аня']);
    expect(done.line.text).toContain('В шкафу');
  });

  it('sends a player who drops the server to hh', () => {
    const round = PartyRound.briefing('server-balance', () => 0);
    const start = 1_000;
    round.start(start, [{ id: 'a', name: 'Аня' }]);

    let now = start;
    for (let step = 0; step < 160; step += 1) {
      now += 50;
      round.tick(now);
    }
    const playing = round.snapshot(now);
    expect(playing.status).toBe('play');
    if (playing.status === 'play' && playing.gameId === 'server-balance') {
      expect(playing.racks[0]?.alive).toBe(false);
    }

    round.tick(start + 15_000);
    const done = round.snapshot(start + 15_000);
    expect(done.status).toBe('result');
    if (done.status === 'result') {
      expect(done.sentToHh.map((player) => player.name)).toEqual(['Аня']);
      expect(done.line.text).toContain('hh');
    }
  });

  it('changes the wind from a sequence that stays on the server', () => {
    let cursor = 0;
    const rolls = [0.9, 0.9, 0, 0, 0.4, 0.6, 0.9, 0, 0, 0.8];
    const round = PartyRound.briefing(
      'server-balance',
      () => rolls[cursor++] ?? 0,
    );
    const start = 5_000;
    round.start(start, [{ id: 'a', name: 'Аня' }]);

    const opening = round.snapshot(start);
    expect(opening.status).toBe('play');
    if (opening.status !== 'play' || opening.gameId !== 'server-balance')
      return;
    expect(opening.wind).toBe(1);
    expect(opening).not.toHaveProperty('winds');

    round.tick(start + 3_000);
    const later = round.snapshot(start + 3_000);
    if (later.status === 'play' && later.gameId === 'server-balance') {
      expect(later.wind).toBe(-0.7);
    }
  });

  it('lets a ghost weigh down one living rack and nobody else', () => {
    const round = PartyRound.briefing('server-balance', () => 0);
    const start = 1_000;
    round.start(
      start,
      [
        { id: 'a', name: 'Аня' },
        { id: 'b', name: 'Боря' },
      ],
      [{ id: 'g', name: 'Призрак' }],
    );
    round.input('g', { hauntTargetId: 'a' }, start);

    const playing = round.snapshot(start);
    expect(playing.status).toBe('play');
    if (playing.status !== 'play' || playing.gameId !== 'server-balance')
      return;
    expect(playing.racks.find((rack) => rack.playerId === 'a')?.heavy).toBe(
      true,
    );
    expect(playing.racks.find((rack) => rack.playerId === 'b')?.heavy).toBe(
      false,
    );
    expect(playing.haunts[0]?.text).toContain('Аня');
    expect(() => round.input('g', { hauntTargetId: 'b' }, start)).toThrow(
      /уже подложил/,
    );
    expect(() => round.input('b', { hauntTargetId: 'a' }, start)).toThrow(/hh/);
  });

  it('narrows the green window only for the haunted player', () => {
    const round = PartyRound.briefing('friday-release', () => 0);
    round.start(
      0,
      [
        { id: 'a', name: 'Аня' },
        { id: 'b', name: 'Боря' },
      ],
      [{ id: 'g', name: 'Призрак' }],
    );
    round.input('g', { hauntTargetId: 'a' }, 10);
    const at = Math.round(0.57 * 2_200);
    round.input('a', {}, at);
    expect(round.snapshot(at, 'a')).toMatchObject({ greenHalf: 0.05 });
    expect(round.snapshot(at, null)).toMatchObject({ greenHalf: 0.1 });
    round.input('b', {}, at);

    const done = round.snapshot(at);
    expect(done.status).toBe('result');
    if (done.status !== 'result') return;
    expect(done.sentToHh.map((player) => player.name)).toEqual(['Аня']);
  });

  it('seals a safe button only on the victim phone and lies only there', () => {
    const red = PartyRound.briefing('red-button', () => 0);
    red.start(0, [{ id: 'a', name: 'Аня' }], [{ id: 'g', name: 'Призрак' }]);
    red.input('g', { hauntTargetId: 'a' }, 1);
    expect(red.snapshot(1, 'a')).toMatchObject({ sealedIndex: 1 });
    expect(red.snapshot(1, null)).toMatchObject({ sealedIndex: null });
    expect(() => red.input('a', { choice: 1 }, 2)).toThrow(/заклеили/);

    const alerts = PartyRound.briefing('alert-repeat', () => 0);
    alerts.start(0, [{ id: 'a', name: 'Аня' }], [{ id: 'g', name: 'Призрак' }]);
    alerts.input('g', { hauntTargetId: 'a' }, 1);
    const victim = alerts.snapshot(1, 'a');
    const screen = alerts.snapshot(1, null);
    if (victim.status !== 'play' || victim.gameId !== 'alert-repeat') return;
    if (screen.status !== 'play' || screen.gameId !== 'alert-repeat') return;
    expect(screen.sequence).toHaveLength(ALERT_LENGTH);
    expect(screen.revealUntil).toBe(ALERT_LENGTH * 1_000);
    expect(screen.sequence[0]).toBe('CPU');
    expect(victim.sequence[0]).toBe('Диск');
    expect(() => alerts.input('g', { hauntTargetId: 'a' }, 1)).toThrow(
      /уже подложил/,
    );
  });

  it('refuses a round where everybody is already on hh', () => {
    const round = PartyRound.briefing('red-button', () => 0);
    expect(() => round.start(0, [], [{ id: 'g', name: 'Призрак' }])).toThrow(
      /штате/,
    );
  });

  it('fires the slowest player when everybody picks a safe button', () => {
    const round = PartyRound.briefing('red-button', () => 0);
    round.start(0, [
      { id: 'a', name: 'Аня' },
      { id: 'b', name: 'Боря' },
    ]);
    round.input('a', { choice: 1 }, 100);
    round.input('b', { choice: 1 }, 400);

    const done = round.snapshot(400);
    expect(done.status).toBe('result');
    if (done.status !== 'result') return;
    expect(done.line.id).toBe('round.all-clear');
    expect(done.sentToHh.map((player) => player.name)).toEqual(['Боря']);
    expect(done.line.text).toContain('Ух какие все молодцы');
  });

  it('keeps everyone who survives a punishment', () => {
    const round = PartyRound.briefing('red-button', () => 0);
    round.keepEveryoneWhoLived();
    round.start(0, [
      { id: 'a', name: 'Аня' },
      { id: 'b', name: 'Боря' },
    ]);
    round.input('a', { choice: 1 }, 100);
    round.input('b', { choice: 1 }, 400);

    const done = round.snapshot(400);
    expect(done.status).toBe('result');
    if (done.status !== 'result') return;
    expect(done.sentToHh).toEqual([]);
    expect(done.line.id).toBe('round.survived');
  });
});
