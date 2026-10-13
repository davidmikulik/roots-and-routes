import common from './common'
import home from './home'
import map from './map'
import tree from './tree'
import gedcom from './gedcom'
import locations from './locations'
import settings from './settings'
import graph from './graph'

export const messages = {
  en: { ...common.en, ...home.en, ...map.en, ...tree.en, ...gedcom.en, ...locations.en, ...settings.en, ...graph.en },
  cs: { ...common.cs, ...home.cs, ...map.cs, ...tree.cs, ...gedcom.cs, ...locations.cs, ...settings.cs, ...graph.cs },
}

export type MessageKey = keyof typeof messages.en
