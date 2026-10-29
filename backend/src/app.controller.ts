import { Controller, Get } from '@nestjs/common';
import { voiceLines } from './voice-lines';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getStatus() {
    return this.appService.getStatus();
  }

  @Get('voice-lines')
  voiceLines() {
    return voiceLines();
  }

  @Get('lan')
  lan() {
    return { host: this.appService.lanHost() };
  }
}
