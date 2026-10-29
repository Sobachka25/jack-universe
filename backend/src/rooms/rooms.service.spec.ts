import { RoomsService } from './rooms.service';

// voice files would stretch stage timings; the flow tests run without them
jest.mock('../audio-duration', () => ({ voiceDurationMs: () => 0 }));

describe('RoomsService', () => {
  const limits = { maxPlayers: 2, emptyTtlMs: 1_000 };

  function makeRooms(): RoomsService {
    const rooms = new RoomsService();
    rooms.limits = limits;
    return rooms;
  }

  it('creates a room and lets the screen open the show', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');

    expect(created.code).toHaveLength(4);
    expect(created.snapshot.phase).toBe('lobby');
    expect(created.snapshot.screenConnected).toBe(true);
    expect(created.snapshot.activity).toBeNull();

    const live = rooms.setPhase('screen', 'live');
    expect(live.phase).toBe('live');
  });

  it('lets the screen choose a minigame and open code review', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');

    const picked = rooms.selectGame('screen', 'server-balance');
    expect(picked.activity).toMatchObject({
      status: 'briefing',
      gameId: 'server-balance',
    });
    expect(picked.code).toBe(created.code);
    expect(() => rooms.selectGame('screen', 'code-review')).toThrow();
  });

  it('restarts a minigame for the superuser and clears hh', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');
    rooms.join('phone', created.code, 'Супер');

    const started = rooms.armGame('screen', 'red-button');
    expect(started.activity).toMatchObject({
      status: 'play',
      gameId: 'red-button',
    });

    rooms.tick(Date.now() + 20_000);
    expect(rooms.snapshot(created.code)?.players[0]?.onHh).toBe(true);

    const again = rooms.replayGame('screen');
    expect(again.players[0]?.onHh).toBe(false);
    expect(again.activity).toMatchObject({
      status: 'play',
      gameId: 'red-button',
    });
    expect(() => rooms.armGame('screen', 'code-review')).toThrow();
  });

  it('keeps a pinned ghost on hh when the superuser replays', () => {
    const rooms = new RoomsService();
    rooms.limits = { maxPlayers: 3, emptyTtlMs: 1_000 };
    const created = rooms.createRoom('screen');
    const living = rooms.join('phone', created.code, 'Супер');
    const ghost = rooms.join('ghost', created.code, 'Призрак');
    rooms.pinGhost('screen', ghost.playerId);

    rooms.armGame('screen', 'red-button');
    rooms.tick(Date.now() + 20_000);
    const again = rooms.replayGame('screen');
    expect(
      again.players.find((player) => player.id === living.playerId)?.onHh,
    ).toBe(false);
    expect(
      again.players.find((player) => player.id === ghost.playerId)?.onHh,
    ).toBe(true);
  });

  it('rejects a duplicate name and a third player', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');

    rooms.join('phone-1', created.code, '  Аня  ');
    expect(() => rooms.join('phone-2', created.code, 'аня')).toThrow(
      'Это имя уже занято',
    );

    rooms.join('phone-2', created.code, 'Боря');
    expect(() => rooms.join('phone-3', created.code, 'Вера')).toThrow(
      'В комнате уже 2 человека',
    );
  });

  it('keeps a disconnected player and lets them return', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');
    const joined = rooms.join('phone-1', created.code, 'Аня');

    expect(rooms.disconnect('phone-1')).toBe(created.code);
    expect(rooms.snapshot(created.code)?.players[0].connected).toBe(false);

    const returned = rooms.rejoin('phone-2', created.code, joined.playerToken);
    expect(returned.playerId).toBe(joined.playerId);
    expect(returned.displacedSocketId).toBeNull();
    expect(rooms.snapshot(created.code)?.players[0].connected).toBe(true);
  });

  it('lets only the screen kick and change phase', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');
    const joined = rooms.join('phone-1', created.code, 'Аня');

    expect(() => rooms.setPhase('phone-1', 'live')).toThrow(
      'Только экран может управлять комнатой',
    );

    const kicked = rooms.kick('screen', joined.playerId);
    expect(kicked.kickedSocketId).toBe('phone-1');
    expect(kicked.snapshot.players).toHaveLength(0);
  });

  it('drops an empty room after the timeout', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');
    rooms.disconnect('screen');

    expect(rooms.sweep(Date.now() + limits.emptyTtlMs)).toEqual([created.code]);
    expect(rooms.snapshot(created.code)).toBeNull();
  });

  it('starts the night from the screen and pauses it', () => {
    const rooms = new RoomsService();
    rooms.limits = { maxPlayers: 4, emptyTtlMs: 1_000 };
    const created = rooms.createRoom('screen');
    const anya = rooms.join('phone-a', created.code, 'Аня');

    expect(() => rooms.startGame('screen')).toThrow(/двое/);
    rooms.join('phone-b', created.code, 'Боря');
    const started = rooms.startGame('screen');
    expect(started.activity).toBeNull();
    expect(started.show?.stage.kind).toBe('trivia');
    expect(started.phase).toBe('live');

    rooms.gameInput('phone-a', { choice: 0 });
    const answered = rooms.snapshot(created.code);
    expect(answered?.show?.stage.kind).toBe('trivia');
    if (answered?.show?.stage.kind !== 'trivia') return;
    expect(answered.show.stage.locked).toContain(anya.playerId);

    const paused = rooms.togglePause('screen');
    expect(paused.show?.paused).toBe(true);
    expect(() => rooms.gameInput('phone-b', { choice: 1 })).toThrow(/Пауза/);
    expect(() => rooms.join('phone-c', created.code, 'Вера')).toThrow(
      /уже идёт/,
    );
  });

  it('keeps the same players when the night starts over', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');
    const anya = rooms.join('phone-a', created.code, 'Аня');
    const borya = rooms.join('phone-b', created.code, 'Боря');
    rooms.pinGhost('screen', borya.playerId);
    rooms.startGame('screen');
    const night = (
      rooms as unknown as {
        nights: Map<string, { order: Array<{ id: string; ghost: boolean }> }>;
      }
    ).nights.get(created.code);
    const ghost = night?.order.find((seat) => seat.id === anya.playerId);
    if (!ghost) throw new Error('Аня не села в вечер');
    ghost.ghost = true;
    expect(
      rooms
        .snapshot(created.code)
        ?.players.find((player) => player.id === anya.playerId)?.onHh,
    ).toBe(true);

    const again = rooms.restartSession('screen');

    expect(again.code).toBe(created.code);
    expect(again.phase).toBe('lobby');
    expect(again.show).toBeNull();
    expect(again.players.map((player) => player.name).sort()).toEqual([
      'Аня',
      'Боря',
    ]);
    expect(again.players.every((player) => !player.onHh)).toBe(true);

    const restarted = rooms.startGame('screen');
    expect(restarted.players.every((player) => !player.onHh)).toBe(true);
    expect(
      restarted.show?.seats.every(
        (seat) => !seat.ghost && seat.role !== 'ghost',
      ),
    ).toBe(true);
  });

  it('opens a new empty room and closes the old one', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');
    rooms.join('phone-a', created.code, 'Аня');
    rooms.join('phone-b', created.code, 'Боря');

    const fresh = rooms.freshStart('screen');

    expect(fresh.closedCode).toBe(created.code);
    expect(fresh.created.code).not.toBe(created.code);
    expect(fresh.created.snapshot.players).toEqual([]);
    expect(fresh.created.snapshot.phase).toBe('lobby');
    expect(rooms.snapshot(created.code)).toBeNull();
    expect(rooms.snapshot(fresh.created.code)?.screenConnected).toBe(true);
  });

  it('rejects a screen token from another room', () => {
    const rooms = makeRooms();
    const created = rooms.createRoom('screen');

    expect(() => rooms.attachScreen('other', created.code, 'nope')).toThrow(
      'Это не экран этой комнаты',
    );
  });
});
