export default {
  name: 'intro',
  title: 'Intro Settings',
  type: 'document',
  fields: [
    {
      name: 'video',
      title: 'Intro Video',
      type: 'mux.video',
      description: 'Intro camera zoom-in. Plays once, then idleVideo loops.'
    },
    {
      name: 'idleVideo',
      title: 'Intro Idle Loop',
      type: 'mux.video',
      description: 'Loop clip that plays after the intro main ends. Seamless ~3s cycle. Played natively with <video loop>.'
    },
    {
      name: 'buttonLabel',
      title: 'Button Label',
      type: 'string',
      description: 'Label for the intro button (default "PRELUDE")',
      initialValue: 'PRELUDE'
    }
  ],
  preview: {
    select: {
      title: 'buttonLabel'
    },
    prepare(selection) {
      const { title } = selection
      return {
        title: `Intro Settings – ${title || 'PRELUDE'}`
      }
    }
  }
}
