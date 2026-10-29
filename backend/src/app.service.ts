import { Injectable } from '@nestjs/common';
import { networkInterfaces, type NetworkInterfaceInfo } from 'os';

@Injectable()
export class AppService {
  getStatus() {
    return { ok: true, service: 'jack-universe' };
  }

  lanHost(): string | null {
    return pickLanHost(networkInterfaces());
  }
}

export function pickLanHost(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string | null {
  const addresses: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const net of list ?? []) {
      const family = String(net.family);
      if (net.internal) continue;
      if (family !== 'IPv4' && family !== '4') continue;
      addresses.push(net.address);
    }
  }
  addresses.sort((left, right) => rank(left) - rank(right));
  return addresses[0] ?? null;
}

function rank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return 2;
  if (address.startsWith('169.254.')) return 4;
  return 3;
}
