import furnitureTemplates from './furniture-catalog.json' with { type: 'json' }

export { furnitureTemplates }
const templatesById = new Map(furnitureTemplates.map((asset) => [asset.id, asset]))
export const furnitureById = (id) => templatesById.get(id)
export const floorLamp = furnitureById('floor-lamp')
export const furnitureCategories = [...new Set(furnitureTemplates.map(({ category }) => category))].sort()

export function filterFurniture(search, category = '', templates = furnitureTemplates) {
  const query = search.trim().toLowerCase()
  return templates.filter((asset) =>
    (!category || asset.category === category) &&
    (asset.name.toLowerCase().includes(query) || asset.category.toLowerCase().includes(query)),
  )
}
