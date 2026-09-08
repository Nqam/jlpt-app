import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadAllGrammar, validateGrammar } from '../../scripts/build-content/parse-grammar';
import { loadLevels } from '../../scripts/build-content/lists';

const points = loadAllGrammar(resolve(__dirname, '../../content/grammar'));
const levels = loadLevels(resolve(__dirname, '../../content/levels.yml'));

describe('curated grammar layer', () => {
  it('validates clean', () => {
    expect(validateGrammar(points)).toEqual([]);
  });

  it('every point references an existing level', () => {
    const codes = new Set(levels.map((l) => l.code));
    for (const p of points) expect(codes.has(p.level)).toBe(true);
  });

  it('N5 has exactly the 43 curated points', () => {
    const n5 = points.filter((p) => p.level === 'N5').map((p) => p.id).sort();
    expect(n5).toEqual(
      [
        'n5-de-particle',
        'n5-deshou',
        'n5-desu',
        'n5-ga-arimasu',
        'n5-ga-imasu',
        'n5-hougaii',
        'n5-ka-question',
        'n5-kara-reason',
        'n5-ku-ni-naru',
        'n5-mada-teimasen',
        'n5-mae-ni',
        'n5-masenka',
        'n5-mashou',
        'n5-mashouka',
        'n5-masu-form',
        'n5-mo-particle',
        'n5-n-desu',
        'n5-naide-kudasai',
        'n5-nakucha-ikenai',
        'n5-ni-he-direction',
        'n5-ni-iku',
        'n5-ni-place-time',
        'n5-no-noun-linking',
        'n5-node',
        'n5-noga-heta',
        'n5-noga-jouzu',
        'n5-noga-suki',
        'n5-nohouga-yori',
        'n5-nonakade-ichiban',
        'n5-sugiru',
        'n5-ta-koto-ga-aru',
        'n5-tai-desu',
        'n5-tari-tari',
        'n5-te-kudasai',
        'n5-teiru',
        'n5-tekara',
        'n5-temoii',
        'n5-tewaikemasen',
        'n5-to-particle',
        'n5-tsumoridesu',
        'n5-wa-particle',
        'n5-wo-particle',
        'n5-ya-particle',
      ].sort(),
    );
  });

  it('N4 has exactly the 50 curated points', () => {
    const n4 = points.filter((p) => p.level === 'N4').map((p) => p.id).sort();
    expect(n4).toEqual(
      [
        'n4-ba-reba',
        'n4-ba-yokatta',
        'n4-ga-hoshii',
        'n4-garu',
        'n4-hazudesu',
        'n4-jishokei-to',
        'n4-ka-douka',
        'n4-kamoshirenai',
        'n4-koto-ni-suru',
        'n4-ku-ni-suru',
        'n4-mitai',
        'n4-nagara',
        'n4-naide',
        'n4-nakutemoii',
        'n4-nara',
        'n4-nasai',
        'n4-ni-frequency',
        'n4-nikui',
        'n4-noni',
        'n4-number-mo',
        'n4-ou-volitional',
        'n4-rareru-passive',
        'n4-saserareru',
        'n4-saseru',
        'n4-shi-particle',
        'n4-shika-nai',
        'n4-sou-desu-dengon',
        'n4-sou-desu-youtai',
        'n4-tara-dou-desu-ka',
        'n4-tara-particle',
        'n4-te-ageru',
        'n4-te-itadakemasenka',
        'n4-te-kureru',
        'n4-te-morau',
        'n4-te-sumimasen',
        'n4-tearu',
        'n4-tehoshii',
        'n4-teiru-aidani',
        'n4-tekurete-arigatou',
        'n4-temiru',
        'n4-temo',
        'n4-teoku',
        'n4-teshimau',
        'n4-teyokatta',
        'n4-to-ii-desu',
        'n4-to-iu',
        'n4-yasui',
        'n4-you-na',
        'n4-you-ni',
        'n4-you-volitional',
      ].sort(),
    );
  });
});
