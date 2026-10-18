export const CATEGORIES = [
  { id: 'sniadanie', label: 'Śniadanie', emoji: '🍳' },
  { id: 'obiad', label: 'Obiad', emoji: '🍲' },
  { id: 'kolacja', label: 'Kolacja', emoji: '🥗' },
  { id: 'deser', label: 'Deser', emoji: '🍰' },
  { id: 'przekaska', label: 'Przekąska', emoji: '🥨' },
  { id: 'napoj', label: 'Napój', emoji: '🥤' },
] as const

export type Category = (typeof CATEGORIES)[number]['id']

export function categoryOf(id: Category) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[1]
}

/** Wartości odżywcze na 100 g produktu. */
export interface FoodRef {
  id: string
  name: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  source: 'local' | 'off' | 'manual'
}

export interface Ingredient {
  id: string
  /** Linia tak, jak ją widzisz/wpisałaś, np. „200 g mąki pszennej”. */
  text: string
  /** Nagłówek sekcji, np. „Ciasto:” – nie liczy się do makro. */
  header?: boolean
  amount: number | null
  unit: string | null
  name: string
  /** Waga w gramach użyta do wyliczeń. */
  grams: number | null
  gramsManual?: boolean
  food: FoodRef | null
  foodManual?: boolean
}

export interface Recipe {
  id: string
  title: string
  category: Category
  servings: number
  prepMinutes: number | null
  ingredients: Ingredient[]
  steps: string[]
  notes: string
  sourceUrl: string
  imageUrl: string
  createdAt: string
  updatedAt: string
}

export function uid(): string {
  return crypto.randomUUID()
}

export function emptyRecipe(): Recipe {
  const now = new Date().toISOString()
  return {
    id: uid(),
    title: '',
    category: 'obiad',
    servings: 2,
    prepMinutes: null,
    ingredients: [],
    steps: [],
    notes: '',
    sourceUrl: '',
    imageUrl: '',
    createdAt: now,
    updatedAt: now,
  }
}
