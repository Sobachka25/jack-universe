import { type NetworkInterfaceInfo } from 'os';
import { pickLanHost } from './app.service';

function card(
  address: string,
  family: NetworkInterfaceInfo['family'],
  internal: boolean,
): NetworkInterfaceInfo {
  return {
    address,
    family,
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    cidr: null,
  };
}

describe('pickLanHost', () => {
  it('prefers a home network address over link-local and public ones', () => {
    expect(
      pickLanHost({
        lo: [card('127.0.0.1', 'IPv4', true)],
        wifi: [
          card('169.254.1.8', 'IPv4', false),
          card('8.8.8.8', 'IPv4', false),
          card('192.168.1.20', 'IPv4', false),
        ],
        v6: [card('fe80::1', 'IPv6', false)],
      }),
    ).toBe('192.168.1.20');
  });

  it('returns null when the machine has no external ipv4', () => {
    expect(
      pickLanHost({
        lo: [card('127.0.0.1', 'IPv4', true)],
      }),
    ).toBeNull();
  });
});
