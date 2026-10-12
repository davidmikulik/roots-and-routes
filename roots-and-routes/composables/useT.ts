import { messages, type MessageKey } from '~~/i18n'
import { useSettings } from '~~/composables/useSettings'

// Usage: const { t } = useT();  {{ t('map.title') }}  or  t('tree.deleteConfirm', { name })
// Reads the language from the settings, so every t() call in a template re-renders when it changes.
export const useT = () => {
  const { settings } = useSettings()
  const t = (key: MessageKey, params?: Record<string, string | number>): string => {
    const template: string = messages[settings.value.language][key] ?? messages.en[key] ?? key
    return params ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : template
  }
  return { t }
}
