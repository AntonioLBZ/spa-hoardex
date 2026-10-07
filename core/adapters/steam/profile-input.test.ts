import { describe, expect, it } from 'vitest';
import {
    STEAMID64_PATTERN,
    VANITY_PATTERN,
    isSteamId64,
    parseProfileInput,
    type ParsedProfileInput,
} from './profile-input.js';

const ID64 = '76561198000001234';
const INVALID: ParsedProfileInput = { kind: 'invalid' };

function id64(steamid: string): ParsedProfileInput {
    return { kind: 'steamid64', steamid };
}

function vanity(name: string): ParsedProfileInput {
    return { kind: 'vanity', vanity: name };
}

describe('isSteamId64 and the patterns', () => {
    it.each(['76561198000001234', '76561197960265728', '76561199999999999', '76561100000000000'])('accepts %s', (v) => {
        expect(isSteamId64(v)).toBe(true);
        expect(STEAMID64_PATTERN.test(v)).toBe(true);
    });

    it.each([
        '',
        '7656119800640953', // 16 digits
        '765611980000012340', // 18 digits
        '66561198006409530', // wrong prefix
        '76561098006409530',
        '7656119800640953a',
        ' 76561198000001234',
        '76561198000001234\n',
        '\uff17\uff16\uff15\uff16\uff11\uff11\uff19\uff18\uff10\uff10\uff16\uff14\uff10\uff19\uff15\uff13\uff10', // fullwidth digits
    ])('rejects %j', (v) => {
        expect(isSteamId64(v)).toBe(false);
    });

    it('keeps the vanity pattern anchored', () => {
        expect(VANITY_PATTERN.test('ab')).toBe(true);
        expect(VANITY_PATTERN.test('a')).toBe(false);
        expect(VANITY_PATTERN.test('foo\n')).toBe(false);
    });
});

describe('parseProfileInput: bare SteamID64', () => {
    it('parses a SteamID64', () => {
        expect(parseProfileInput(ID64)).toEqual(id64(ID64));
    });

    it('trims surrounding whitespace', () => {
        expect(parseProfileInput(`  ${ID64}\t\n`)).toEqual(id64(ID64));
    });

    it('rejects 16 and 18 digit numbers and wrong prefixes', () => {
        expect(parseProfileInput('7656119800640953')).toEqual(vanity('7656119800640953'));
        expect(parseProfileInput('765611980000012340')).toEqual(vanity('765611980000012340'));
        expect(parseProfileInput('66561198006409530')).toEqual(vanity('66561198006409530'));
    });

    it('rejects internal whitespace', () => {
        expect(parseProfileInput('76561198 006409530')).toEqual(INVALID);
    });
});

describe('parseProfileInput: bare vanity', () => {
    it.each(['gabelogannewell', 'Some_User-1', 'ABC', 'a_', '-_', '12', '007'])('accepts %s as typed', (v) => {
        expect(parseProfileInput(v)).toEqual(vanity(v));
    });

    it('keeps the case as typed', () => {
        expect(parseProfileInput('MixedCASE')).toEqual(vanity('MixedCASE'));
    });

    it('trims whitespace', () => {
        expect(parseProfileInput('  foo  ')).toEqual(vanity('foo'));
    });

    it('enforces the 2..32 length boundaries', () => {
        expect(parseProfileInput('a')).toEqual(INVALID);
        expect(parseProfileInput('ab')).toEqual(vanity('ab'));
        expect(parseProfileInput('a'.repeat(32))).toEqual(vanity('a'.repeat(32)));
        expect(parseProfileInput('a'.repeat(33))).toEqual(INVALID);
    });

    it.each(['foo bar', 'foo.bar', 'foo/bar', 'foo@bar', 'foo!', 'foo:bar', 'foo\\bar', '@foo', '#foo'])(
        'rejects %j',
        (v) => {
            expect(parseProfileInput(v)).toEqual(INVALID);
        }
    );

    it('reads a vanity made only of an id64 as a SteamID64', () => {
        expect(parseProfileInput('76561198000001234')).toEqual(id64('76561198000001234'));
    });

    it('treats a digits-only name that is not an id64 as a vanity', () => {
        expect(parseProfileInput('1234567890')).toEqual(vanity('1234567890'));
    });
});

describe('parseProfileInput: empty and oversized', () => {
    it.each(['', ' ', '   ', '\t', '\n', ' \r\n '])('rejects blank %j', (v) => {
        expect(parseProfileInput(v)).toEqual(INVALID);
    });

    it('rejects input longer than 200 characters, even when the rest is valid', () => {
        expect(parseProfileInput(`steamcommunity.com/id/foo/${'a'.repeat(200)}`)).toEqual(INVALID);
        expect(parseProfileInput('a'.repeat(201))).toEqual(INVALID);
    });

    it('accepts a valid URL of exactly 200 characters', () => {
        const prefix = 'steamcommunity.com/id/foo/';
        const input = prefix + 'a'.repeat(200 - prefix.length);
        expect(input).toHaveLength(200);
        expect(parseProfileInput(input)).toEqual(vanity('foo'));
    });

    it('rejects one character over 200 on the same URL', () => {
        const prefix = 'steamcommunity.com/id/foo/';
        const input = prefix + 'a'.repeat(201 - prefix.length);
        expect(input).toHaveLength(201);
        expect(parseProfileInput(input)).toEqual(INVALID);
    });

    it('measures the limit after trimming', () => {
        expect(parseProfileInput(`${' '.repeat(500)}foo${' '.repeat(500)}`)).toEqual(vanity('foo'));
    });
});

describe('parseProfileInput: control characters', () => {
    it.each([
        ['NUL', 'foo\u0000bar'],
        ['tab inside', 'foo\tbar'],
        ['newline inside', 'foo\nbar'],
        ['carriage return inside', 'foo\rbar'],
        ['escape', 'foo\u001bbar'],
        ['DEL', 'foo\u007fbar'],
        ['C1 control', 'foo\u0085bar'],
        ['NUL in id64', `${ID64}\u0000`],
        ['newline in URL', 'steamcommunity.com/id/foo\n/games'],
        ['tab in URL host', 'steam\tcommunity.com/id/foo'],
    ])('rejects %s', (_label, input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });
});

describe('parseProfileInput: SteamID2', () => {
    it('converts against a known value', () => {
        expect(parseProfileInput('STEAM_0:0:19867753')).toEqual(id64('76561198000001234'));
    });

    it('uses the parity bit', () => {
        expect(parseProfileInput('STEAM_0:1:19867752')).toEqual(id64('76561198000001233'));
    });

    it.each([
        ['STEAM_0:1:0', '76561197960265729'],
        ['STEAM_0:0:1', '76561197960265730'],
        ['STEAM_1:0:19867753', '76561198000001234'],
        ['STEAM_5:1:19867752', '76561198000001233'],
        ['STEAM_0:1:1019867135', '76561199999999999'],
        ['  STEAM_0:0:19867753  ', '76561198000001234'],
        ['steam_0:0:19867753', '76561198000001234'],
    ])('converts %j', (input, expected) => {
        expect(parseProfileInput(input)).toEqual(id64(expected));
    });

    it.each([
        'STEAM_6:0:1', // universe out of range
        'STEAM_0:2:1', // parity bit must be 0 or 1
        'STEAM_0:0:', // missing account
        'STEAM_0:0:-1', // negative
        'STEAM_0:0:1.5',
        'STEAM_0:0:abc',
        'STEAM_0:0',
        'STEAM_0:0:1:1',
        'STEAM__0:0:1',
        'STEAM_0:0:12345678901', // 11 digits
        'STEAM_0:0:1019867136', // converts above the SteamID64 range
        'STEAM_0:1:4294967295',
        'STEAM_0:0:99999999999999999999999999',
        'STEAM_0:0:\u0663', // Arabic-Indic digit
        '[STEAM_0:0:1]',
        'xSTEAM_0:0:1',
    ])('rejects %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });

    it('never produces a result outside the SteamID64 pattern', () => {
        for (const z of ['0', '1', '23071901', '1019867135', '1019867136', '2147483647', '9999999999']) {
            for (const y of ['0', '1']) {
                const parsed = parseProfileInput(`STEAM_0:${y}:${z}`);
                if (parsed.kind === 'steamid64') expect(STEAMID64_PATTERN.test(parsed.steamid)).toBe(true);
                else expect(parsed).toEqual(INVALID);
            }
        }
    });
});

describe('parseProfileInput: SteamID3', () => {
    it('converts against a known value', () => {
        expect(parseProfileInput('[U:1:39735506]')).toEqual(id64('76561198000001234'));
    });

    it('accepts the form without brackets', () => {
        expect(parseProfileInput('U:1:39735506')).toEqual(id64('76561198000001234'));
    });

    it.each([
        ['[U:1:1]', '76561197960265729'],
        ['[U:1:2]', '76561197960265730'],
        ['[u:1:39735506]', '76561198000001234'],
        ['  [U:1:39735506]  ', '76561198000001234'],
        ['[U:1:2039734271]', '76561199999999999'],
        ['U:1:0039735506', '76561198000001234'],
    ])('converts %j', (input, expected) => {
        expect(parseProfileInput(input)).toEqual(id64(expected));
    });

    it.each([
        '[U:1:39735506', // unbalanced
        'U:1:39735506]',
        '[[U:1:39735506]]',
        '[U:2:46143802]', // other universe
        '[U:0:46143802]',
        '[G:1:46143802]', // other account type
        '[U:1:]',
        '[U:1:-5]',
        '[U:1:1.5]',
        '[U:1:abc]',
        '[U:1:2039734272]', // converts above the SteamID64 range
        '[U:1:4294967295]',
        '[U:1:12345678901]', // 11 digits
        '[U:1:39735506:1]', // instance suffix
        '[U:1]',
        '[U:1:39735506] extra',
        '[U:1:\u0664\u0666\u0661\u0664\u0663\u0668\u0660\u0662]', // Arabic-Indic digits
        '[U:1:\uff14\uff16\uff11\uff14\uff13\uff18\uff10\uff12]', // fullwidth digits
    ])('rejects %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });
});

describe('parseProfileInput: profile URLs', () => {
    it.each([
        ['https://steamcommunity.com/profiles/76561198000001234', id64(ID64)],
        ['https://steamcommunity.com/profiles/76561198000001234/', id64(ID64)],
        ['http://steamcommunity.com/profiles/76561198000001234', id64(ID64)],
        ['https://www.steamcommunity.com/profiles/76561198000001234', id64(ID64)],
        ['http://www.steamcommunity.com/profiles/76561198000001234/', id64(ID64)],
        ['steamcommunity.com/profiles/76561198000001234', id64(ID64)],
        ['www.steamcommunity.com/profiles/76561198000001234', id64(ID64)],
        ['HTTPS://SteamCommunity.COM/profiles/76561198000001234', id64(ID64)],
        ['https://steamcommunity.com/profiles/76561198000001234/games', id64(ID64)],
        ['https://steamcommunity.com/profiles/76561198000001234/games/?tab=all', id64(ID64)],
        ['https://steamcommunity.com/profiles/76561198000001234?l=spanish', id64(ID64)],
        ['https://steamcommunity.com/profiles/76561198000001234/#section', id64(ID64)],
        ['https://steamcommunity.com/profiles/76561198000001234/wishlist/?a=1#b', id64(ID64)],
        ['https://steamcommunity.com/id/gabelogannewell', vanity('gabelogannewell')],
        ['https://steamcommunity.com/id/gabelogannewell/', vanity('gabelogannewell')],
        ['http://steamcommunity.com/id/gabelogannewell', vanity('gabelogannewell')],
        ['https://www.steamcommunity.com/id/gabelogannewell', vanity('gabelogannewell')],
        ['steamcommunity.com/id/gabelogannewell', vanity('gabelogannewell')],
        ['www.steamcommunity.com/id/gabelogannewell/', vanity('gabelogannewell')],
        ['https://steamcommunity.com/id/Mixed_Case-1', vanity('Mixed_Case-1')],
        ['https://steamcommunity.com/id/foo/games', vanity('foo')],
        ['https://steamcommunity.com/id/foo/wishlist/', vanity('foo')],
        ['https://steamcommunity.com/id/foo/games/?tab=all&sort=name', vanity('foo')],
        ['https://steamcommunity.com/id/foo?l=english', vanity('foo')],
        ['https://steamcommunity.com/id/foo#top', vanity('foo')],
        ['https://steamcommunity.com/id/foo/?utm=1#top', vanity('foo')],
        ['  https://steamcommunity.com/id/foo  ', vanity('foo')],
    ])('%j', (input, expected) => {
        expect(parseProfileInput(input)).toEqual(expected);
    });

    it('matches the /id/ and /profiles/ keywords case-insensitively', () => {
        expect(parseProfileInput('https://steamcommunity.com/ID/Foo')).toEqual(vanity('Foo'));
        expect(parseProfileInput('https://steamcommunity.com/Profiles/76561198000001234')).toEqual(id64(ID64));
    });

    it('treats an /id/ segment that is an id64 as a SteamID64', () => {
        expect(parseProfileInput('https://steamcommunity.com/id/76561198000001234')).toEqual(id64(ID64));
    });

    it('enforces vanity length boundaries inside URLs', () => {
        expect(parseProfileInput('https://steamcommunity.com/id/a')).toEqual(INVALID);
        expect(parseProfileInput('https://steamcommunity.com/id/ab')).toEqual(vanity('ab'));
        expect(parseProfileInput(`https://steamcommunity.com/id/${'a'.repeat(32)}`)).toEqual(vanity('a'.repeat(32)));
        expect(parseProfileInput(`https://steamcommunity.com/id/${'a'.repeat(33)}`)).toEqual(INVALID);
    });

    it.each([
        '//steamcommunity.com/id/foo', // protocol-relative
        'https://steamcommunity.com',
        'https://steamcommunity.com/',
        'https://steamcommunity.com/id',
        'https://steamcommunity.com/id/',
        'https://steamcommunity.com//id/foo',
        'https://steamcommunity.com/id//foo',
        'https://steamcommunity.com/profiles',
        'https://steamcommunity.com/profiles/',
        'https://steamcommunity.com/profiles/foo',
        'https://steamcommunity.com/profiles/7656119800640953', // 16 digits
        'https://steamcommunity.com/profiles/765611980000012340', // 18 digits
        'https://steamcommunity.com/profiles/66561198006409530',
        'https://steamcommunity.com/groups/foo',
        'https://steamcommunity.com/app/730',
        'https://steamcommunity.com/games/foo',
        'https://steamcommunity.com/market/id/foo',
        'https://steamcommunity.com/?id=foo',
        'https://steamcommunity.com/#/id/foo',
        'https://steamcommunity.com/id/foo bar',
        'https://steamcommunity.com/id/foo%20bar',
        'https://steamcommunity.com/id/%66oo', // percent-encoded names are not decoded
        'https://steamcommunity.com/id/foo%2Fbar',
        'https://steamcommunity.com/id/foo.bar',
        'https://steamcommunity.com/id/%E3%81%82%E3%81%82',
    ])('rejects the unusable URL %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });
});

describe('parseProfileInput: hostile and look-alike URLs', () => {
    it.each([
        // foreign hosts and the usual suffix/prefix tricks
        'https://evil.com/id/foo',
        'evil.com/id/foo',
        'https://steamcommunity.com.evil.com/id/foo',
        'steamcommunity.com.evil.com/id/foo',
        'https://evilsteamcommunity.com/id/foo',
        'https://notsteamcommunity.com/profiles/76561198000001234',
        'https://steamcommunity.co/id/foo',
        'https://steamcommunity.com.au/id/foo',
        'https://steamcommunity-com.evil.com/id/foo',
        'https://sub.steamcommunity.com/id/foo',
        'https://store.steampowered.com/id/foo',
        'https://steampowered.com/id/foo',
        'https://steamcommunity.com./id/foo', // trailing dot
        // the target hidden in other URL parts
        'https://evil.com/?steamcommunity.com/id/foo',
        'https://evil.com/#steamcommunity.com/id/foo',
        'https://evil.com/steamcommunity.com/id/foo',
        'https://evil.com/https://steamcommunity.com/id/foo',
        'https://evil.com?u=https://steamcommunity.com/id/foo',
        // userinfo tricks
        'https://steamcommunity.com@evil.com/id/foo',
        'https://steamcommunity.com:pass@evil.com/id/foo',
        'https://evil.com@steamcommunity.com/id/foo',
        'https://user:pass@steamcommunity.com/id/foo',
        'steamcommunity.com@evil.com/id/foo',
        // backslash confusion (WHATWG treats it as a slash)
        'https://evil.com\\@steamcommunity.com/id/foo',
        'https://steamcommunity.com\\@evil.com/id/foo',
        'https://steamcommunity.com\\.evil.com/id/foo',
        'https:\\\\steamcommunity.com\\id\\foo',
        // ports
        'https://steamcommunity.com:8080/id/foo',
        'steamcommunity.com:443/id/foo',
        // schemes
        'javascript:alert(1)',
        'javascript://steamcommunity.com/id/foo',
        'javascript:steamcommunity.com/id/foo',
        'JaVaScRiPt:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'data:text/html,steamcommunity.com/id/foo',
        'ftp://steamcommunity.com/id/foo',
        'file:///etc/passwd',
        'file://steamcommunity.com/id/foo',
        'ws://steamcommunity.com/id/foo',
        'steam://openurl/https://steamcommunity.com/id/foo',
        'view-source:https://steamcommunity.com/id/foo',
        'blob:https://steamcommunity.com/id/foo',
        'mailto:steamcommunity.com/id/foo',
        // malformed
        'https://',
        'https:///id/foo',
        'http:steamcommunity.com/id/foo',
        'https://steamcommunity.com id/foo',
        ' https : //steamcommunity.com/id/foo',
        'https://steamcommunity.com/id/foo\u0000',
        // IP and number hosts
        'https://127.0.0.1/id/foo',
        'https://[::1]/id/foo',
        'http://2130706433/id/foo',
    ])('rejects %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });
});

describe('parseProfileInput: unicode look-alikes', () => {
    it.each([
        ['Cyrillic i in the host', 'https://steamcommun\u0456ty.com/id/foo'],
        ['Cyrillic a in the host', 'https://ste\u0430mcommunity.com/id/foo'],
        ['Cyrillic e in the host', 'https://st\u0435amcommunity.com/id/foo'],
        [
            'fullwidth host',
            'https://\uff53\uff54\uff45\uff41\uff4d\uff43\uff4f\uff4d\uff4d\uff55\uff4e\uff49\uff54\uff59.com/id/foo',
        ],
        ['fullwidth dot', 'https://steamcommunity\uff0ecom/id/foo'],
        ['ideographic full stop', 'https://steamcommunity\u3002com/id/foo'],
        ['fullwidth slash', 'https://steamcommunity.com\uff0fid\uff0ffoo'],
        ['soft hyphen in the host', 'https://steam\u00adcommunity.com/id/foo'],
        ['zero-width space in the host', 'https://steam\u200bcommunity.com/id/foo'],
        ['zero-width joiner in the host', 'https://steamcommunity\u200d.com/id/foo'],
        ['right-to-left override', 'https://\u202eevil.com/id/foo'],
        ['non-breaking space before the path', 'https://steamcommunity.com\u00a0/id/foo'],
        ['Cyrillic letters in a bare vanity', 'f\u043eo'],
        ['accented letter in a bare vanity', 'caf\u00e9'],
        ['Cyrillic in the URL vanity', 'https://steamcommunity.com/id/f\u043eo'],
        [
            'fullwidth digits id64 in a URL',
            'https://steamcommunity.com/profiles/\uff17\uff16\uff15\uff16\uff11\uff11\uff19\uff18\uff10\uff10\uff16\uff14\uff10\uff19\uff15\uff13\uff10',
        ],
        ['fullwidth letters in a bare vanity', '\uff46\uff4f\uff4f'],
        ['long s standing in for S in STEAM_', '\u017fTEAM_0:0:1'],
        ['Kelvin sign as K in a vanity', '\u212aevin'],
    ])('rejects %s', (_label, input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });

    it('treats non-ASCII-only whitespace around valid input as trimmable', () => {
        expect(parseProfileInput('\u00a0foo\u3000')).toEqual(vanity('foo'));
    });
});

describe('parseProfileInput: other junk', () => {
    it('treats plain words such as null or undefined as vanities', () => {
        expect(parseProfileInput('null')).toEqual(vanity('null'));
        expect(parseProfileInput('undefined')).toEqual(vanity('undefined'));
    });

    it.each([
        '../etc/passwd',
        '/id/foo',
        '/profiles/76561198000001234',
        'id/foo',
        'profiles/76561198000001234',
        '<script>alert(1)</script>',
        "foo'; DROP TABLE users;--",
        'foo%00',
        '${jndi:ldap://evil.com/a}',
        '{{7*7}}',
        '76561198000001234/games',
        '76561198000001234,76561198000001235',
        'foo,bar',
        'https://steamcommunity.com/id/foo https://steamcommunity.com/id/bar',
    ])('rejects %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });
});

describe('parseProfileInput: account id 0 and protocol-relative URLs', () => {
    // Account id 0 fits the pattern but is not a real account
    it.each([
        '76561197960265728',
        'STEAM_0:0:0',
        'STEAM_1:0:0',
        '[U:1:0]',
        'U:1:0',
        'https://steamcommunity.com/profiles/76561197960265728',
        'https://steamcommunity.com/id/76561197960265728',
    ])('rejects account id 0 given as %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });

    it('accepts the first real account id', () => {
        expect(parseProfileInput('[U:1:1]')).toEqual(id64('76561197960265729'));
        expect(parseProfileInput('STEAM_0:1:0')).toEqual(id64('76561197960265729'));
    });

    it.each([
        '//steamcommunity.com/id/foo',
        '//www.steamcommunity.com/profiles/76561198000001234',
        '///steamcommunity.com/id/foo',
    ])('rejects the protocol-relative URL %j', (input) => {
        expect(parseProfileInput(input)).toEqual(INVALID);
    });
});

describe('parseProfileInput: result shape', () => {
    it('returns plain data with only the documented keys', () => {
        expect(Object.keys(parseProfileInput(ID64)).sort()).toEqual(['kind', 'steamid']);
        expect(Object.keys(parseProfileInput('foo')).sort()).toEqual(['kind', 'vanity']);
        expect(Object.keys(parseProfileInput('')).sort()).toEqual(['kind']);
    });

    it('freezes the shared invalid result so a caller cannot corrupt later calls', () => {
        expect(Object.isFrozen(parseProfileInput(''))).toBe(true);
    });
});
