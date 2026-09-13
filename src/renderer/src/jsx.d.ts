import 'react'

// chessground styles its sprites via the custom element <piece>;
// the captured-pieces bars reuse those sprites.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
