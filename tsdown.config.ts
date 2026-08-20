import { externalClientBundle } from '../../tools/dshx/src/client-build.js'

export default externalClientBundle('dsh-approve-for-me', ['lib/types/dsh-approve-for-me.js'], {
  clientEntry: 'src/client/index.tsx',
})
