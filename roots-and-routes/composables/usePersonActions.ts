// The actions on one person, defined once for the buttons (app/components/PersonActions.vue) and the right-click menu
// (app/components/PersonActionsMenu.vue): show the detail, edit, add a father / mother / partner / child / sibling.
// The detail is for everyone (the page decides what it shows); the editing actions only with the permission to edit
// the database, on the real data, through the shared person editor (composables/usePersonEditor.ts).
import { RELATIONS, type PersonEditor } from '~~/composables/usePersonEditor'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'

export interface PersonAction {
  key: 'detail' | 'edit' | (typeof RELATIONS)[number]
  label: string
  icon: string
  disabled: boolean
  // Why the action is not available
  hint?: string
  // Starts a group of the "add" actions (a heading in the buttons, a separator in the menu)
  group?: 'add'
  run: () => void
}

export const usePersonActions = (options: {
  editor?: PersonEditor | null
  personId: () => string
  // Shows the detail of the person; without it there is no detail action
  onDetail?: (id: string) => void
}) => {
  const { t } = useT()
  const adminAuth = useAdminAuth()

  return computed<PersonAction[]>(() => {
    const id = options.personId()
    if (!id) return []
    const actions: PersonAction[] = []
    if (options.onDetail) actions.push({ key: 'detail', label: t('tree.action.detail'), icon: 'ℹ', disabled: false, run: () => options.onDetail!(id) })
    const editor = options.editor
    if (!editor || !adminAuth.canEdit.value || !editor.canEdit.value) return actions
    actions.push({ key: 'edit', label: t('tree.edit'), icon: '✎', disabled: false, run: () => editor.openEdit(id) })
    const available = editor.availability(id)
    RELATIONS.forEach((relation, index) => actions.push({
      key: relation,
      label: t(`tree.relation.${relation}`),
      icon: '+',
      disabled: !available[relation],
      hint: available[relation] ? undefined : t(relation === 'sibling' ? 'tree.relation.siblingNeedsParent' : 'tree.relation.parentExists'),
      group: index === 0 ? 'add' : undefined,
      run: () => editor.openNew(relation, id),
    }))
    return actions
  })
}
