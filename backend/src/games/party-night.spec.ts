import { PartyNight } from './party-night';
import { QuizQuestion } from './questions';

const bank: QuizQuestion[] = [
  {
    prompt: 'Где печеньки?',
    correct: 'В шкафу',
    wrong: ['В чате', 'В трекере', 'В проде'],
  },
  {
    prompt: 'Кто дежурит?',
    correct: 'Аня',
    wrong: ['Боря', 'Вера', 'Глеб'],
  },
];

const cast = [
  { id: 'a', name: 'Аня' },
  { id: 'b', name: 'Боря' },
];

function night(punishments: Array<'red-button'> = ['red-button']) {
  return PartyNight.begin(cast, {
    random: () => 0,
    bank,
    now: 0,
    triviaMs: 1_000,
    beatMs: 500,
    voiceMs: () => 0,
    briefMs: 200,
    countdownMs: 100,
    punishments,
  });
}

describe('PartyNight', () => {
  it('pays the stake for a right answer and sends the miss to punishment', () => {
    const game = night();
    const opening = game.snapshot(0);
    expect(opening.stage).toMatchObject({
      kind: 'trivia',
      prompt: 'Где печеньки?',
    });

    game.input('a', { choice: 3 }, 10);
    game.input('b', { choice: 0 }, 20);
    const graded = game.snapshot(20);
    expect(graded.stage.kind).toBe('trivia-result');
    expect(graded.line.text).toContain('Верный ответ: В шкафу');
    expect(graded.line.text).toContain('На наказание: Боря');
    expect(graded.seats.find((seat) => seat.playerId === 'a')?.score).toBe(
      1000,
    );
    expect(graded.seats.find((seat) => seat.playerId === 'b')?.role).toBe(
      'awaiting',
    );

    game.tick(520);
    const briefing = game.snapshot(520);
    expect(briefing.stage).toMatchObject({
      kind: 'briefing',
      title: 'Красная кнопка',
    });
    if (briefing.stage.kind === 'briefing') {
      expect(briefing.stage.text).toContain('четыре');
    }
    game.tick(720);
    expect(game.snapshot(720).stage).toMatchObject({ kind: 'countdown' });
    game.tick(820);
    expect(game.snapshot(820).stage.kind).toBe('punishment');

    game.input('b', { choice: 0 }, 830);
    const judged = game.snapshot(830);
    expect(judged.stage.kind).toBe('punishment-result');
    expect(judged.seats.find((seat) => seat.playerId === 'b')?.ghost).toBe(
      true,
    );
    expect(judged.seats.find((seat) => seat.playerId === 'a')?.score).toBe(
      1000,
    );

    game.tick(830 + 500);
    const finale = game.snapshot(830 + 500);
    expect(finale.stage.kind).toBe('finale');
    expect(finale.seats.find((seat) => seat.playerId === 'a')?.lane).toBe(2);
    expect(finale.seats.find((seat) => seat.playerId === 'b')?.lane).toBe(0);
  });

  it('skips punishment when the whole staff is right and draws a new question', () => {
    const game = night();
    expect(game.snapshot(0).stage).toMatchObject({ prompt: 'Где печеньки?' });
    game.input('a', { choice: 3 }, 10);
    game.input('b', { choice: 3 }, 20);
    game.tick(520);
    const next = game.snapshot(520);
    expect(next.round).toBe(2);
    expect(next.stage).toMatchObject({
      kind: 'trivia',
      prompt: 'Кто дежурит?',
    });
    expect(next.seats.every((seat) => seat.score === 1000)).toBe(true);
  });

  it('pays half the stake when the punishment is survived', () => {
    const game = night();
    game.tick(1_000);
    game.tick(1_500);
    game.tick(1_700);
    game.tick(1_800);
    game.input('a', { choice: 1 }, 1_810);
    game.input('b', { choice: 1 }, 1_820);
    const judged = game.snapshot(1_820);
    expect(judged.line.text).toContain('пережили все');
    expect(
      judged.seats.every((seat) => seat.score === 500 && !seat.ghost),
    ).toBe(true);
    game.tick(1_820 + 500);
    expect(game.snapshot(2_320).round).toBe(2);
  });

  it('opens the finale when the punishment kills the whole staff', () => {
    const game = night();
    game.tick(1_000);
    game.tick(1_500);
    game.tick(1_700);
    game.tick(1_800);
    game.input('a', { choice: 0 }, 1_810);
    game.input('b', { choice: 0 }, 1_820);
    game.tick(1_820 + 500);
    const finale = game.snapshot(2_320);
    expect(finale.stage.kind).toBe('finale');
    expect(finale.seats.find((seat) => seat.playerId === 'a')).toMatchObject({
      ghost: false,
      lane: 0,
    });
    expect(finale.seats.find((seat) => seat.playerId === 'b')).toMatchObject({
      ghost: true,
      lane: 0,
    });
  });

  it('runs six trivia rounds and then a race to the exit', () => {
    const game = night();
    let now = 0;
    for (let round = 1; round <= 6; round += 1) {
      const playing = game.snapshot(now);
      expect(playing.round).toBe(round);
      expect(playing.stage.kind).toBe('trivia');
      game.input('a', { choice: 3 }, now + 10);
      game.input('b', { choice: 3 }, now + 20);
      now += 20 + 500;
      game.tick(now);
    }
    const finale = game.snapshot(now);
    expect(finale.stage.kind).toBe('finale');
    expect(
      finale.seats.every((seat) => seat.score === 6000 && seat.lane === 6),
    ).toBe(true);

    for (let step = 0; step < 3; step += 1) {
      game.input('a', { choice: 3 }, now + 10);
      game.input('b', { choice: 3 }, now + 20);
      expect(game.snapshot(now + 20).stage.kind).toBe('finale-step');
      now += 20 + 500;
      game.tick(now);
    }
    game.input('a', { choice: 3 }, now + 10);
    game.input('b', { choice: 3 }, now + 20);
    const step = game.snapshot(now + 20);
    expect(step.stage.kind).toBe('finale-step');
    expect(step.seats.every((seat) => seat.lane === 10)).toBe(true);
    expect(
      step.seats.filter((seat) => !seat.ghost).map((seat) => seat.name),
    ).toEqual(['Аня']);
    game.tick(now + 520);
    const done = game.snapshot(now + 520);
    expect(done.stage).toMatchObject({
      kind: 'done',
      winnerName: 'Аня',
    });
    expect(done.seats.every((seat) => seat.lane === 10)).toBe(true);
  });

  it('gives the finale life to whoever pulls ahead of the leader', () => {
    const game = night();
    game.input('a', { choice: 3 }, 10);
    game.input('b', { choice: 0 }, 20);
    game.tick(520);
    game.tick(720);
    game.tick(820);
    game.input('b', { choice: 0 }, 830);
    game.tick(1_330);
    const opening = game.snapshot(1_330);
    expect(opening.stage.kind).toBe('finale');
    expect(opening.seats.find((seat) => seat.playerId === 'a')).toMatchObject({
      ghost: false,
      lane: 2,
    });
    expect(opening.seats.find((seat) => seat.playerId === 'b')).toMatchObject({
      ghost: true,
      lane: 0,
    });

    let now = 1_330;
    for (let step = 0; step < 2; step += 1) {
      game.input('a', { choice: 0 }, now + 10);
      game.input('b', { choice: 3 }, now + 20);
      now += 520;
      game.tick(now);
    }
    const tied = game.snapshot(now);
    expect(tied.seats.find((seat) => seat.playerId === 'a')?.ghost).toBe(false);
    expect(tied.seats.find((seat) => seat.playerId === 'b')?.lane).toBe(2);

    game.input('a', { choice: 0 }, now + 10);
    game.input('b', { choice: 3 }, now + 20);
    const passed = game.snapshot(now + 20);
    expect(passed.stage.kind).toBe('finale-step');
    if (passed.stage.kind === 'finale-step') {
      expect(passed.stage.gained.map((item) => item.name)).toEqual(['Боря']);
    }
    expect(passed.seats.find((seat) => seat.playerId === 'b')).toMatchObject({
      ghost: false,
      lane: 3,
    });
    expect(passed.seats.find((seat) => seat.playerId === 'a')).toMatchObject({
      ghost: true,
      lane: 2,
    });
  });

  it('lets a ghost score on the next question and sabotage the punishment', () => {
    const game = PartyNight.begin(
      [
        { id: 'a', name: 'Аня' },
        { id: 'b', name: 'Боря' },
        { id: 'c', name: 'Вера' },
      ],
      {
        random: () => 0,
        bank,
        now: 0,
        triviaMs: 1_000,
        beatMs: 500,
    voiceMs: () => 0,
        briefMs: 200,
        countdownMs: 100,
        punishments: ['red-button'],
      },
    );
    game.input('a', { choice: 3 }, 10);
    game.input('b', { choice: 3 }, 20);
    game.input('c', { choice: 0 }, 30);
    game.tick(530);
    game.tick(730);
    game.tick(830);
    game.input('c', { choice: 0 }, 840);
    game.tick(730 + 12_000);
    game.tick(730 + 12_500);
    game.input('c', { choice: 3 }, 13_300);

    game.input('a', { choice: 3 }, 13_310);
    game.input('b', { choice: 0 }, 13_320);
    expect(game.snapshot(13_320).seats.find((seat) => seat.playerId === 'c')).toMatchObject({
      ghost: true,
      score: 1000,
      role: 'ghost',
    });
    expect(game.snapshot(13_320).seats.find((seat) => seat.playerId === 'b')?.role).toBe(
      'awaiting',
    );
    game.tick(13_820);
    game.tick(14_020);
    game.tick(14_120);
    const playing = game.snapshot(14_120, 'b');
    expect(playing.stage.kind).toBe('punishment');
    game.input('c', { hauntTargetId: 'b' }, 14_130);
    const victim = game.snapshot(14_130, 'b');
    const screen = game.snapshot(14_130, null);
    expect(victim.stage).toMatchObject({ kind: 'punishment' });
    expect(screen.stage).toMatchObject({ kind: 'punishment' });
    if (victim.stage.kind !== 'punishment') return;
    if (screen.stage.kind !== 'punishment') return;
    expect(victim.stage.activity).toMatchObject({ sealedIndex: 1 });
    expect(screen.stage.activity).toMatchObject({ sealedIndex: null });
    if (victim.stage.activity.status !== 'play') return;
    expect(victim.stage.activity.haunts[0]?.text).toContain('Боря');
  });

  it('does not send a ghost who misses back to punishment', () => {
    const game = PartyNight.begin(
      [
        { id: 'a', name: 'Аня' },
        { id: 'b', name: 'Боря' },
        { id: 'c', name: 'Вера' },
      ],
      {
        random: () => 0,
        bank,
        now: 0,
        triviaMs: 1_000,
        beatMs: 500,
    voiceMs: () => 0,
        briefMs: 200,
        countdownMs: 100,
        punishments: ['red-button'],
      },
    );
    game.input('a', { choice: 3 }, 10);
    game.input('b', { choice: 3 }, 20);
    game.input('c', { choice: 0 }, 30);
    game.tick(530);
    game.tick(730);
    game.tick(830);
    game.input('c', { choice: 0 }, 840);
    game.tick(1_340);
    game.input('a', { choice: 3 }, 1_350);
    game.input('b', { choice: 3 }, 1_360);
    game.input('c', { choice: 0 }, 1_370);
    const graded = game.snapshot(1_370);
    expect(graded.stage.kind).toBe('trivia-result');
    expect(graded.seats.find((seat) => seat.playerId === 'c')).toMatchObject({
      ghost: true,
      score: 0,
      role: 'ghost',
    });
    expect(graded.seats.every((seat) => seat.role !== 'awaiting')).toBe(true);
  });

  it('freezes the question clock while Nikolai is paused', () => {
    const game = night();
    game.togglePause(100);
    expect(game.tick(5_000)).toBe(false);
    expect(game.snapshot(5_000)).toMatchObject({
      paused: true,
      stage: { kind: 'trivia' },
    });
    expect(() => game.input('a', { choice: 3 }, 200)).toThrow(/Пауза/);
    game.togglePause(400);
    expect(game.snapshot(1_200).stage.kind).toBe('trivia');
    game.tick(1_300);
    expect(game.snapshot(1_300).stage.kind).toBe('trivia-result');
  });

  it('does not repeat a question until the deck is empty', () => {
    const game = night();
    const first = game.snapshot(0);
    game.input('a', { choice: 3 }, 10);
    game.input('b', { choice: 3 }, 20);
    game.tick(520);
    const second = game.snapshot(520);
    game.input('a', { choice: 3 }, 530);
    game.input('b', { choice: 3 }, 540);
    game.tick(1_040);
    const third = game.snapshot(1_040);
    if (first.stage.kind !== 'trivia' || second.stage.kind !== 'trivia') return;
    if (third.stage.kind !== 'trivia') return;
    expect(first.stage.prompt).not.toBe(second.stage.prompt);
    expect(third.stage.prompt).toBe(first.stage.prompt);
  });
  it('starts the answer clock only after the question is read', () => {
    const game = PartyNight.begin(cast, {
      random: () => 0,
      bank: [{ prompt: 'q', correct: 'a', wrong: ['b', 'c', 'd'], audio: 'q.mp3' }],
      now: 0,
      triviaMs: 1_000,
      voiceMs: (folder) => (folder === 'questions' ? 3_000 : 0),
    });
    expect(game.snapshot(0).stage).toMatchObject({
      kind: 'trivia',
      readUntil: 3_500,
      endsAt: 4_500,
    });
    expect(game.tick(4_000)).toBe(false);
  });
  it('reads the final intro and the question before the finale clock', () => {
    const game = PartyNight.begin(cast, {
      random: () => 0,
      bank: [{ prompt: 'q', correct: 'a', wrong: ['b', 'c', 'd'], audio: 'q.mp3' }],
      now: 0,
      triviaMs: 1_000,
      beatMs: 500,
      briefMs: 200,
      countdownMs: 100,
      punishments: ['red-button'],
      voiceMs: (folder) => (folder === 'other' ? 2_000 : 3_000),
    });
    const internal = game as unknown as { beginFinale(now: number): void };
    internal.beginFinale(0);
    expect(game.snapshot(0).stage).toMatchObject({
      kind: 'finale',
      intro: 'final_intro.mp3',
      readUntil: 5_500,
      endsAt: 6_500,
    });
  });
  it('reads every later finale question before its clock', () => {
    const game = PartyNight.begin(cast, {
      random: () => 0,
      bank: [{ prompt: 'q', correct: 'a', wrong: ['b', 'c', 'd'], audio: 'q.mp3' }],
      now: 0,
      triviaMs: 1_000,
      beatMs: 500,
      voiceMs: (folder) => (folder === 'other' ? 2_000 : 3_000),
    });
    const internal = game as unknown as {
      beginFinale(now: number): void;
      afterBeat(now: number): void;
      status: string;
    };
    internal.beginFinale(0);
    internal.status = 'finale-step';
    internal.afterBeat(10_000);
    expect(game.snapshot(10_000).stage).toMatchObject({
      kind: 'finale',
      audio: 'q.mp3',
      intro: null,
      readUntil: 13_500,
      endsAt: 14_500,
    });
  });
  it('plays the intro first and reveals the answer after the host line', () => {
    const game = PartyNight.begin(cast, {
      random: () => 0,
      bank: [{ prompt: 'q', correct: 'a', wrong: ['b', 'c', 'd'] }],
      now: 0,
      triviaMs: 1_000,
      beatMs: 500,
      answerLines: ['answer_01.mp3'],
      voiceMs: (folder) => (folder === 'intro' ? 2_000 : folder === 'answer' ? 1_000 : 0),
    });
    expect(game.snapshot(0).stage).toMatchObject({ kind: 'intro', endsAt: 2_500 });
    expect(game.tick(2_500)).toBe(true);
    expect(game.snapshot(2_500).stage.kind).toBe('trivia');
    expect(game.tick(3_500)).toBe(true);
    expect(game.snapshot(3_600).stage).toMatchObject({
      kind: 'trivia-result',
      correct: null,
      revealed: false,
      answerLine: 'answer_01.mp3',
    });
    expect(game.tick(4_800)).toBe(true);
    expect(game.snapshot(4_800).stage).toMatchObject({ correct: 'a', revealed: true });
  });
  it('stretches the minigame briefing to its voice-over', () => {
    const game = PartyNight.begin(cast, {
      random: () => 0,
      bank,
      now: 0,
      triviaMs: 1_000,
      beatMs: 500,
      briefMs: 200,
      countdownMs: 100,
      punishments: ['red-button'],
      voiceMs: (folder) => (folder === 'briefing' ? 4_000 : 0),
    });
    game.input('a', { choice: 0 }, 0);
    game.input('b', { choice: 1 }, 0);
    game.tick(600);
    expect(game.snapshot(600).stage).toMatchObject({
      kind: 'briefing',
      audio: 'red-button.mp3',
      endsAt: 5_100,
    });
  });
});
