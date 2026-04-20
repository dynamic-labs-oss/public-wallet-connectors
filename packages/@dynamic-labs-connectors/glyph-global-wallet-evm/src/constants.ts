import * as chains from "viem/chains";
import { type Chain } from "viem/chains";

export const STAGING_GLYPH_APP_ID = 'clxt9p8e601al6tgmsyhu7j3t';
export const GLYPH_APP_ID = 'cly38x0w10ac945q9yg9sm71i';
export const GLYPH_ICON_URL = 'https://i.ibb.co/TxcwPQyr/Group-12489-1.png';
export const VIEM_CHAINS = Object.values(chains).reduce(
  (acc, chain) => {
      acc[chain.id] = chain;
      return acc;
  },
  {} as Record<number, Chain>
);

export const glyphConnectorDetails = {
  id: 'io.useglyph.privy',
  name: 'Glyph',
  iconUrl: GLYPH_ICON_URL,
  iconBackground: '#ffffff',
  shortName: 'Glyph',
  type: 'injected',
} as const;
