import type { TextStyle } from 'react-native';

/**
 * Centralised type scale. Replaces ad-hoc fontSize numbers scattered through
 * screen StyleSheets. Use directly via `T.title` or spread into a style array.
 */
export const T = {
  display:    { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 } as TextStyle,
  heading:    { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 } as TextStyle,
  title:      { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 } as TextStyle,
  titleSmall: { fontSize: 17, fontWeight: '700' } as TextStyle,
  body:       { fontSize: 15, fontWeight: '500' } as TextStyle,
  bodySmall:  { fontSize: 13, fontWeight: '500' } as TextStyle,
  caption:    { fontSize: 12, fontWeight: '500' } as TextStyle,
  micro:      { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' } as TextStyle,
};

/** Consistent spacing tokens. Use S(2) = 8, S(4) = 16, etc. */
export const S = (n: number) => n * 4;
