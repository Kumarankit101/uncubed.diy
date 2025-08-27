import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--uncubed-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--uncubed-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--uncubed-elements-terminal-textColor'),
    background: cssVar('--uncubed-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--uncubed-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--uncubed-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--uncubed-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--uncubed-elements-terminal-color-black'),
    red: cssVar('--uncubed-elements-terminal-color-red'),
    green: cssVar('--uncubed-elements-terminal-color-green'),
    yellow: cssVar('--uncubed-elements-terminal-color-yellow'),
    blue: cssVar('--uncubed-elements-terminal-color-blue'),
    magenta: cssVar('--uncubed-elements-terminal-color-magenta'),
    cyan: cssVar('--uncubed-elements-terminal-color-cyan'),
    white: cssVar('--uncubed-elements-terminal-color-white'),
    brightBlack: cssVar('--uncubed-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--uncubed-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--uncubed-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--uncubed-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--uncubed-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--uncubed-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--uncubed-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--uncubed-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
