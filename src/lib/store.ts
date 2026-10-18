import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Recipe } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

export const isCloud = supabase !== null

export interface Store {
  list(): Promise<Recipe[]>
  get(id: string): Promise<Recipe | undefined>
  save(recipe: Recipe): Promise<Recipe>
  remove(id: string): Promise<void>
  /** Zapisuje zdjęcie i zwraca adres, który można trzymać w przepisie. */
  uploadImage(blob: Blob, recipeId: string): Promise<string>
}

// ---------- Chmura (Supabase) ----------

const BUCKET = 'recipe-images'

const cloudStore: Store = {
  async list() {
    const { data, error } = await supabase!.from('recipes').select('data').order('updated_at', { ascending: false })
    if (error) throw error
    return data.map((r) => r.data as Recipe)
  },
  async get(id) {
    const { data, error } = await supabase!.from('recipes').select('data').eq('id', id).maybeSingle()
    if (error) throw error
    return (data?.data as Recipe) ?? undefined
  },
  async save(recipe) {
    const r = { ...recipe, updatedAt: new Date().toISOString() }
    const { error } = await supabase!.from('recipes').upsert({
      id: r.id,
      title: r.title,
      category: r.category,
      data: r,
      updated_at: r.updatedAt,
    })
    if (error) throw error
    return r
  },
  async remove(id) {
    const existing = await cloudStore.get(id)
    const { error } = await supabase!.from('recipes').delete().eq('id', id)
    if (error) throw error
    const path = existing?.imageUrl.split(`/${BUCKET}/`)[1]
    if (path) await supabase!.storage.from(BUCKET).remove([path])
  },
  async uploadImage(blob, recipeId) {
    const { data: auth } = await supabase!.auth.getUser()
    if (!auth.user) throw new Error('Nie jesteś zalogowana')
    const path = `${auth.user.id}/${recipeId}-${Date.now()}.jpg`
    const { error } = await supabase!.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  },
}

// ---------- Tryb lokalny (IndexedDB) ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('przepisnik', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('recipes', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('recipes', mode).objectStore('recipes'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const localStore: Store = {
  async list() {
    const all = await tx<Recipe[]>('readonly', (s) => s.getAll())
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  get: (id) => tx<Recipe | undefined>('readonly', (s) => s.get(id)),
  async save(recipe) {
    const r = { ...recipe, updatedAt: new Date().toISOString() }
    await tx('readwrite', (s) => s.put(r))
    return r
  },
  async remove(id) {
    await tx('readwrite', (s) => s.delete(id))
  },
  uploadImage: (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    }),
}

export const store: Store = isCloud ? cloudStore : localStore
