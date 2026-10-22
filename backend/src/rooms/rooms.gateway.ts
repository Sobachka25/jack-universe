import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameInput } from '../games/party-round';
import { RoomError } from './room.model';
import { RoomsService } from './rooms.service';

const SWEEP_INTERVAL_MS = 15_000;
const GAME_TICK_MS = 50;

@WebSocketGateway({
  cors: { origin: true },
})
export class RoomsGateway
  implements OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RoomsGateway.name);
  private timer: NodeJS.Timeout | null = null;
  private gameTimer: NodeJS.Timeout | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly rooms: RoomsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      for (const code of this.rooms.sweep()) {
        this.server.to(code).emit('room:closed', { code });
        void this.server.in(code).socketsLeave(code);
      }
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
    this.gameTimer = setInterval(() => {
      if (!this.server) return;
      for (const code of this.rooms.tick(Date.now())) {
        this.publish(code);
      }
    }, GAME_TICK_MS);
    this.gameTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.gameTimer) clearInterval(this.gameTimer);
  }

  handleDisconnect(client: Socket): void {
    const code = this.rooms.disconnect(client.id);
    if (code) this.publish(code);
  }

  @SubscribeMessage('room:create')
  async create(@ConnectedSocket() client: Socket) {
    return this.guard(async () => {
      const created = this.rooms.createRoom(client.id);
      await this.leavePrevious(client, created.previousCode, created.code);
      await client.join(created.code);
      this.publish(created.code);
      return {
        ok: true as const,
        role: 'screen' as const,
        code: created.code,
        screenToken: created.screenToken,
        snapshot: created.snapshot,
      };
    });
  }

  @SubscribeMessage('room:attach-screen')
  async attachScreen(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    return this.guard(async () => {
      const attached = this.rooms.attachScreen(
        client.id,
        readString(body, 'code'),
        readString(body, 'screenToken'),
      );
      const code = attached.snapshot.code;
      await this.leavePrevious(client, attached.previousCode, code);
      this.displace(
        attached.displacedSocketId,
        code,
        'Экран комнаты открыли в другом окне',
      );
      await client.join(code);
      this.publish(code);
      return {
        ok: true as const,
        role: 'screen' as const,
        snapshot: attached.snapshot,
      };
    });
  }

  @SubscribeMessage('room:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(async () => {
      const joined = this.rooms.join(
        client.id,
        readString(body, 'code'),
        readString(body, 'name'),
      );
      await this.leavePrevious(
        client,
        joined.previousCode,
        joined.snapshot.code,
      );
      await client.join(joined.snapshot.code);
      this.publish(joined.snapshot.code);
      return {
        ok: true as const,
        role: 'player' as const,
        playerId: joined.playerId,
        playerToken: joined.playerToken,
        name: joined.name,
        snapshot: joined.snapshot,
      };
    });
  }

  @SubscribeMessage('room:rejoin')
  async rejoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    return this.guard(async () => {
      const joined = this.rooms.rejoin(
        client.id,
        readString(body, 'code'),
        readString(body, 'playerToken'),
      );
      await this.leavePrevious(
        client,
        joined.previousCode,
        joined.snapshot.code,
      );
      this.displace(
        joined.displacedSocketId,
        joined.snapshot.code,
        'Вы вошли с другого устройства',
      );
      await client.join(joined.snapshot.code);
      this.publish(joined.snapshot.code);
      return {
        ok: true as const,
        role: 'player' as const,
        playerId: joined.playerId,
        playerToken: joined.playerToken,
        name: joined.name,
        snapshot: joined.snapshot,
      };
    });
  }

  @SubscribeMessage('room:set-phase')
  setPhase(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(() => {
      const phase = readString(body, 'phase');
      if (phase !== 'lobby' && phase !== 'live') {
        throw new RoomError('Неизвестная фаза');
      }
      const snapshot = this.rooms.setPhase(client.id, phase);
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('room:select-game')
  selectGame(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(() => {
      const snapshot = this.rooms.selectGame(
        client.id,
        readString(body, 'gameId'),
      );
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('room:start-game')
  startGame(@ConnectedSocket() client: Socket) {
    return this.guard(() => {
      const snapshot = this.rooms.startGame(client.id);
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('room:arm')
  armGame(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(() => {
      const snapshot = this.rooms.armGame(
        client.id,
        readString(body, 'gameId'),
      );
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('room:replay')
  replayGame(@ConnectedSocket() client: Socket) {
    return this.guard(() => {
      const snapshot = this.rooms.replayGame(client.id);
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('room:stop-game')
  stopGame(@ConnectedSocket() client: Socket) {
    return this.guard(() => {
      const snapshot = this.rooms.stopGame(client.id);
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('game:input')
  gameInput(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(() => {
      const code = this.rooms.gameInput(client.id, readGameInput(body));
      if (code) this.publish(code);
      return { ok: true as const };
    });
  }

  @SubscribeMessage('room:pin-hh')
  pinGhost(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(() => {
      const snapshot = this.rooms.pinGhost(
        client.id,
        readString(body, 'playerId'),
      );
      this.publish(snapshot.code);
      return { ok: true as const, snapshot };
    });
  }

  @SubscribeMessage('room:kick')
  kick(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.guard(() => {
      const result = this.rooms.kick(client.id, readString(body, 'playerId'));
      this.displace(
        result.kickedSocketId,
        result.snapshot.code,
        'Ведущий убрал вас из комнаты',
      );
      this.publish(result.snapshot.code);
      return { ok: true as const, snapshot: result.snapshot };
    });
  }

  private async guard<T>(fn: () => Promise<T> | T) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof RoomError) {
        return { ok: false as const, message: error.message };
      }
      this.logger.error(error);
      return { ok: false as const, message: 'Что-то сломалось на сервере' };
    }
  }

  private publish(code: string): void {
    const sockets = this.server.sockets.adapter.rooms.get(code);
    if (!sockets) return;
    for (const socketId of sockets) {
      const snapshot = this.rooms.snapshot(code, socketId);
      if (snapshot) this.server.to(socketId).emit('room:state', snapshot);
    }
  }

  private async leavePrevious(
    client: Socket,
    previousCode: string | null,
    nextCode: string,
  ): Promise<void> {
    if (!previousCode || previousCode === nextCode) return;
    await client.leave(previousCode);
    this.publish(previousCode);
  }

  private displace(
    socketId: string | null,
    code: string,
    message: string,
  ): void {
    if (!socketId) return;
    const other = this.server.sockets.sockets.get(socketId);
    void other?.leave(code);
    this.server.to(socketId).emit('room:displaced', { message });
  }
}

function readString(body: unknown, key: string): string {
  if (!body || typeof body !== 'object' || !(key in body)) return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readGameInput(body: unknown): GameInput {
  const hold = readString(body, 'hold');
  const choice = readNumber(body, 'choice');
  const sequence = readStringList(body, 'sequence');
  const hauntTargetId = readString(body, 'hauntTargetId');
  return {
    ...(hold === 'left' || hold === 'right' || hold === 'none' ? { hold } : {}),
    ...(choice === undefined ? {} : { choice }),
    ...(sequence ? { sequence } : {}),
    ...(hauntTargetId ? { hauntTargetId } : {}),
  };
}

function readNumber(body: unknown, key: string): number | undefined {
  if (!body || typeof body !== 'object' || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

function readStringList(body: unknown, key: string): string[] | undefined {
  if (!body || typeof body !== 'object' || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    return undefined;
  }
  return value;
}
