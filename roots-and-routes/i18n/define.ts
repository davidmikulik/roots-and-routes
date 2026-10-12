// Czech must contain every key that English has (checked by the type system)
export const defineMessages = <T extends Record<string, string>>(en: T, cs: Record<keyof T, string>) => ({ en, cs })
